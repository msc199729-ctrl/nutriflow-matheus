import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

/**
 * Os tipos são o contrato entre o que cria a notificação e o que a tela
 * desenha. String livre aqui viraria "plano" num lugar e "PLANO" no outro.
 */
export const TipoNotificacao = {
  planoPublicado: 'plano_publicado',
  formularioEnviado: 'formulario_enviado',
} as const;

export type TipoNotificacaoValor =
  (typeof TipoNotificacao)[keyof typeof TipoNotificacao];

export interface CriarNotificacao {
  idPaciente: number;
  tipo: TipoNotificacaoValor;
  titulo: string;
  mensagem: string;
  idReferencia?: number | null;
}

export interface NotificacaoPublica {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  idReferencia: number | null;
  criadoEm: Date;
  lidaEm: Date | null;
}

/**
 * Caixa de entrada do paciente no app.
 *
 * Acesso por SQL direto (`$queryRaw`), e não pelo cliente tipado do Prisma:
 * assim o build não depende de `prisma generate` ter rodado nem de o modelo
 * estar declarado no schema — o mesmo caminho já usado pelo timbre
 * (`ProfissionalService`). A tabela é criada pela migração
 * `20261127090000_add_notificacao_paciente`.
 */
@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria uma notificação. NUNCA lança: avisar o paciente não pode desfazer o
   * que o nutricionista fez. Se o aviso falhar, o plano continua publicado e o
   * erro fica no log — o oposto (rollback por causa de um aviso) seria pior.
   */
  async criar(dados: CriarNotificacao): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "notificacoes" ("id_paciente", "tipo", "titulo", "mensagem", "id_referencia")
        VALUES (${dados.idPaciente}, ${dados.tipo}, ${dados.titulo}, ${dados.mensagem},
                ${dados.idReferencia ?? null})
      `;
    } catch (erro) {
      this.logger.error(
        `Falha ao notificar paciente ${dados.idPaciente} (${dados.tipo}): ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }

  /**
   * Evita aviso repetido do mesmo item: republicar um plano que já foi avisado
   * hoje não vira duas notificações iguais na caixa do paciente.
   */
  async criarSeNovo(dados: CriarNotificacao): Promise<void> {
    try {
      const existentes = await this.prisma.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "notificacoes"
         WHERE "id_paciente" = ${dados.idPaciente}
           AND "tipo" = ${dados.tipo}
           AND "id_referencia" IS NOT DISTINCT FROM ${dados.idReferencia ?? null}
           AND "criado_em" >= NOW() - INTERVAL '12 hours'
         LIMIT 1
      `;
      if (existentes.length > 0) return;
    } catch {
      // Se a checagem falhar, cria: aviso a mais é menos grave que aviso nenhum.
    }
    await this.criar(dados);
  }

  /** Caixa de entrada do paciente logado. */
  async minhas(user: JwtPayloadUser) {
    if (user.perfil !== PerfilUsuario.paciente) {
      return { itens: [], naoLidas: 0 };
    }
    const [itens, contagem] = await Promise.all([
      this.prisma.$queryRaw<NotificacaoPublica[]>`
        SELECT "id", "tipo", "titulo", "mensagem", "id_referencia" AS "idReferencia",
               "criado_em" AS "criadoEm", "lida_em" AS "lidaEm"
          FROM "notificacoes"
         WHERE "id_paciente" = ${user.sub}
         ORDER BY "criado_em" DESC
         LIMIT 50
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*)::bigint AS "total"
          FROM "notificacoes"
         WHERE "id_paciente" = ${user.sub} AND "lida_em" IS NULL
      `,
    ]);
    return { itens, naoLidas: Number(contagem[0]?.total ?? 0) };
  }

  /** Marca uma notificação como lida. Idempotente: reler não muda a data. */
  async marcarLida(id: number, user: JwtPayloadUser) {
    if (user.perfil !== PerfilUsuario.paciente) {
      throw new NotFoundException('Notificação não encontrada');
    }
    const linhas = await this.prisma.$queryRaw<Array<{ id: number; lidaEm: Date | null }>>`
      UPDATE "notificacoes"
         SET "lida_em" = COALESCE("lida_em", NOW())
       WHERE "id" = ${id} AND "id_paciente" = ${user.sub}
      RETURNING "id", "lida_em" AS "lidaEm"
    `;
    if (linhas.length === 0) throw new NotFoundException('Notificação não encontrada');
    return linhas[0];
  }

  async marcarTodasLidas(user: JwtPayloadUser) {
    if (user.perfil !== PerfilUsuario.paciente) return { atualizadas: 0 };
    const r = await this.prisma.$executeRaw`
      UPDATE "notificacoes"
         SET "lida_em" = NOW()
       WHERE "id_paciente" = ${user.sub} AND "lida_em" IS NULL
    `;
    return { atualizadas: r };
  }

  /**
   * Quantas notificações não lidas por paciente — usado pelo nutricionista para
   * saber se o aviso chegou a ser visto, não só enviado.
   */
  async contarNaoLidasPorPaciente(idPaciente: number): Promise<number> {
    const r = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS "total"
        FROM "notificacoes"
       WHERE "id_paciente" = ${idPaciente} AND "lida_em" IS NULL
    `;
    return Number(r[0]?.total ?? 0);
  }
}
