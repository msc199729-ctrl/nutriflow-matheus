import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../common/tenant/tenant-scope';

/** Cada copo registrado pelo paciente. */
export interface IngestaoAguaItem {
  id: number;
  quantidadeMl: number;
  registradoEm: Date;
}

/**
 * Água do paciente.
 *
 * Vive fora do `RegistroDiario` de propósito: beber água não é refeição. Antes,
 * registrar um copo ou criava um registro diário vazio (poluindo o diário
 * alimentar) ou batia numa rota inexistente.
 *
 * Acesso por SQL direto (`$queryRaw`), como em `NotificacoesService` e no
 * timbre: assim o build não depende de `prisma generate` ter rodado nem de o
 * modelo estar declarado no schema — o que importa quando a tabela é criada por
 * migração idempotente.
 */
@Injectable()
export class AguaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Data no fuso LOCAL do servidor. `new Date('2026-11-27')` seria meia-noite
   * UTC e, no Brasil, cairia no dia anterior às 21h — o mesmo bug de fuso que
   * já corrigimos no financeiro.
   */
  private intervaloDoDia(dataStr?: string): { inicio: Date; fim: Date } {
    let base: Date;
    if (dataStr) {
      const [ano, mes, dia] = dataStr.split('-').map(Number);
      base = new Date(ano, (mes || 1) - 1, dia || 1);
      if (Number.isNaN(base.getTime())) base = new Date();
    } else {
      base = new Date();
    }
    return {
      inicio: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0),
      fim: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999),
    };
  }

  /**
   * Quem está pedindo: o paciente sempre vê só o que é dele.
   * Nutricionista/admin precisa informar o paciente e o vínculo é conferido.
   */
  private async resolverPaciente(
    user: JwtPayloadUser,
    idPacienteQuery?: number,
  ): Promise<number> {
    if (user.perfil === PerfilUsuario.paciente) {
      if (idPacienteQuery != null && idPacienteQuery !== user.sub) {
        throw new ForbiddenException('Paciente só pode ver a própria água');
      }
      return user.sub;
    }
    if (idPacienteQuery == null) {
      throw new ForbiddenException('Informe idPaciente');
    }
    const wid = requireWorkspaceId(user);
    const vinculo = await this.prisma.paciente.findFirst({
      where: {
        id: idPacienteQuery,
        workspaceId: wid,
        ...(user.perfil === PerfilUsuario.nutricionista
          ? { idNutricionista: user.sub }
          : {}),
      },
      select: { id: true },
    });
    if (!vinculo) throw new ForbiddenException('Paciente não vinculado a você');
    return idPacienteQuery;
  }

  /**
   * Meta diária do paciente, em ml.
   *
   * O plano alimentar pode sobrescrever a meta do cadastro (`metaAguaLitros` no
   * plano × `metaAguaMl` no paciente). A regra é a mesma do PDF do plano: o que
   * vale é o plano ativo; sem plano, o cadastro.
   */
  private async metaDoPaciente(idPaciente: number): Promise<number | null> {
    const plano = await this.prisma.planoAlimentar.findFirst({
      where: { idPaciente, ativo: true, metaAguaLitros: { not: null } },
      orderBy: { id: 'desc' },
      select: { metaAguaLitros: true },
    });
    if (plano?.metaAguaLitros != null && plano.metaAguaLitros > 0) {
      return Math.round(plano.metaAguaLitros * 1000);
    }
    const paciente = await this.prisma.paciente.findUnique({
      where: { id: idPaciente },
      select: { metaAguaMl: true },
    });
    return paciente?.metaAguaMl != null ? Math.round(paciente.metaAguaMl) : null;
  }

  /**
   * Ingestões do dia + total + meta.
   *
   * A meta vem junto de propósito: o app precisa das três coisas ao mesmo tempo
   * para desenhar o card, e duas requisições para isso só criam uma janela em
   * que a barra aparece sem meta.
   */
  async listar(user: JwtPayloadUser, dataStr?: string, idPaciente?: number) {
    const id = await this.resolverPaciente(user, idPaciente);
    const { inicio, fim } = this.intervaloDoDia(dataStr);

    const [itens, metaAguaMl] = await Promise.all([
      this.prisma.$queryRaw<IngestaoAguaItem[]>`
        SELECT "id", "quantidade_ml" AS "quantidadeMl", "registrado_em" AS "registradoEm"
          FROM "ingestoes_agua"
         WHERE "id_paciente" = ${id}
           AND "registrado_em" >= ${inicio}
           AND "registrado_em" <= ${fim}
         ORDER BY "registrado_em" ASC
      `,
      this.metaDoPaciente(id),
    ]);

    const totalMl = itens.reduce((acc, i) => acc + (i.quantidadeMl ?? 0), 0);
    return { itens, totalMl, metaAguaMl };
  }

  /**
   * Registra um copo. O limite de 1500 ml por clique não é capricho: acima
   * disso é quase certo ser engano de digitação (15 em vez de 1500), e desfazer
   * depois exigiria o paciente entender a lista de registros.
   */
  async registrar(
    user: JwtPayloadUser,
    quantidadeMl: number,
    idPaciente?: number,
  ) {
    const ml = Math.round(Number(quantidadeMl));
    if (!Number.isFinite(ml) || ml < 50 || ml > 1500) {
      throw new BadRequestException('Informe uma quantidade entre 50 e 1500 ml.');
    }

    const id = await this.resolverPaciente(user, idPaciente);

    const linhas = await this.prisma.$queryRaw<IngestaoAguaItem[]>`
      INSERT INTO "ingestoes_agua" ("id_paciente", "quantidade_ml")
      VALUES (${id}, ${ml})
      RETURNING "id", "quantidade_ml" AS "quantidadeMl", "registrado_em" AS "registradoEm"
    `;
    return linhas[0];
  }

  /** Desfaz um copo. Só o dono do registro pode remover. */
  async remover(user: JwtPayloadUser, id: number) {
    const dono = await this.prisma.$queryRaw<Array<{ idPaciente: number }>>`
      SELECT "id_paciente" AS "idPaciente" FROM "ingestoes_agua" WHERE "id" = ${id} LIMIT 1
    `;
    if (dono.length === 0) {
      throw new NotFoundException('Registro de água não encontrado');
    }

    // O paciente só apaga o que é dele; nutricionista só do paciente vinculado.
    await this.resolverPaciente(user, dono[0]?.idPaciente);

    await this.prisma.$executeRaw`DELETE FROM "ingestoes_agua" WHERE "id" = ${id}`;
    return { ok: true, id };
  }
}
