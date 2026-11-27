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
      await this.prisma.notificacao.create({
        data: {
          idPaciente: dados.idPaciente,
          tipo: dados.tipo,
          titulo: dados.titulo,
          mensagem: dados.mensagem,
          idReferencia: dados.idReferencia ?? null,
        },
      });
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
      const existente = await this.prisma.notificacao.findFirst({
        where: {
          idPaciente: dados.idPaciente,
          tipo: dados.tipo,
          idReferencia: dados.idReferencia ?? null,
          criadoEm: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (existente) return;
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
    const [itens, naoLidas] = await Promise.all([
      this.prisma.notificacao.findMany({
        where: { idPaciente: user.sub },
        orderBy: { criadoEm: 'desc' },
        take: 50,
      }),
      this.prisma.notificacao.count({
        where: { idPaciente: user.sub, lidaEm: null },
      }),
    ]);
    return { itens, naoLidas };
  }

  /** Marca uma notificação como lida. Idempotente: reler não muda a data. */
  async marcarLida(id: number, user: JwtPayloadUser) {
    if (user.perfil !== PerfilUsuario.paciente) {
      throw new NotFoundException('Notificação não encontrada');
    }
    const notificacao = await this.prisma.notificacao.findFirst({
      where: { id, idPaciente: user.sub },
      select: { id: true, lidaEm: true },
    });
    if (!notificacao) throw new NotFoundException('Notificação não encontrada');
    if (notificacao.lidaEm) return { id, lidaEm: notificacao.lidaEm };
    const atualizada = await this.prisma.notificacao.update({
      where: { id },
      data: { lidaEm: new Date() },
      select: { id: true, lidaEm: true },
    });
    return atualizada;
  }

  async marcarTodasLidas(user: JwtPayloadUser) {
    if (user.perfil !== PerfilUsuario.paciente) return { atualizadas: 0 };
    const r = await this.prisma.notificacao.updateMany({
      where: { idPaciente: user.sub, lidaEm: null },
      data: { lidaEm: new Date() },
    });
    return { atualizadas: r.count };
  }

  /**
   * Quantas notificações não lidas por paciente — usado pelo nutricionista para
   * saber se o aviso chegou a ser visto, não só enviado.
   */
  async contarNaoLidasPorPaciente(idPaciente: number): Promise<number> {
    return this.prisma.notificacao.count({
      where: { idPaciente, lidaEm: null },
    });
  }
}
