import { ForbiddenException, Injectable } from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../common/tenant/tenant-scope';
import { CreateRegistroDiarioDto } from './dto/create-registro-diario.dto';

@Injectable()
export class DailyLogsService {
  constructor(private readonly prisma: PrismaService) {}
 async findByDay(
  user: JwtPayloadUser,
  dataStr?: string,
  idPacienteQuery?: string,
) {
 let data: Date;
if (dataStr) {
  // Converte "YYYY-MM-DD" para meia-noite LOCAL (evita o bug de fuso UTC)
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  data = new Date(ano, (mes || 1) - 1, dia || 1);
  if (Number.isNaN(data.getTime())) {
    data = new Date();
  }
} else {
  data = new Date();
}

  let idPaciente: number;

  if (user.perfil === 'paciente') {
    // Paciente logado: sempre vê apenas os próprios registros.
    idPaciente = user.sub;
  } else if (idPacienteQuery) {
    // Nutricionista/admin consultando um paciente específico.
    const id = parseInt(idPacienteQuery, 10);
    if (Number.isNaN(id)) {
      throw new ForbiddenException('idPaciente inválido');
    }
    const wid = requireWorkspaceId(user);
    const vinculo =
      user.perfil === PerfilUsuario.nutricionista
        ? await this.prisma.paciente.findFirst({
            where: {
              id,
              workspaceId: wid,
              idNutricionista: user.sub,
            },
          })
        : await this.prisma.paciente.findFirst({
            where: { id, workspaceId: wid },
          });
    if (!vinculo) {
      throw new ForbiddenException('Paciente não vinculado a você');
    }
    idPaciente = id;
  } else {
    throw new ForbiddenException('Informe idPaciente para consultar registros');
  }

  const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0);
  const fim = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 23, 59, 59);
  const registros = await this.prisma.registroDiario.findMany({
    where: {
      idPaciente,
      registradoEm: { gte: inicio, lte: fim },
    },
    include: { itensConsumidos: { include: { alimento: true } } },
    orderBy: { registradoEm: 'asc' },
  });

  // A água saiu do registro diário: beber não é refeição, e cada copo agora tem
  // linha própria em `ingestoes_agua` (rota /registros-diarios/agua). Somar
  // `registro.ingestaoAguaMl` aqui daria sempre 0 a partir de agora e o
  // nutricionista veria "0 L" mesmo com o paciente registrando o dia inteiro.
  const aguaDoDia = await this.prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM("quantidade_ml"), 0)::int AS "total"
      FROM "ingestoes_agua"
     WHERE "id_paciente" = ${idPaciente}
       AND "registrado_em" >= ${inicio}
       AND "registrado_em" <= ${fim}
  `;
  // Registros anteriores à migração ainda guardam a água no campo legado;
  // somar mantém o histórico do nutricionista sem regressão.
  const aguaLegada = registros.reduce(
    (acc, r) => acc + (r.ingestaoAguaMl ?? 0),
    0,
  );
  const totalAguaMl = (aguaDoDia[0]?.total ?? 0) + aguaLegada;

  // A meta vai junto: o prontuário mostra "X de Y L", e sem ela a tela teria
  // que fazer uma segunda chamada só para o denominador.
  const paciente = await this.prisma.paciente.findUnique({
    where: { id: idPaciente },
    select: { metaAguaMl: true },
  });

  return { registros, totalAguaMl, metaAguaMl: paciente?.metaAguaMl ?? null };
}
  private async resolveIdPaciente(
    dto: CreateRegistroDiarioDto,
    user: JwtPayloadUser,
  ): Promise<number> {
    if (dto.idPaciente != null) {
      if (user.perfil === 'paciente' && dto.idPaciente !== user.sub) {
        throw new ForbiddenException('Paciente só pode criar registro para si mesmo');
      }
      if (user.perfil === PerfilUsuario.nutricionista) {
        const wid = requireWorkspaceId(user);
        const ok = await this.prisma.paciente.findFirst({
          where: {
            id: dto.idPaciente,
            workspaceId: wid,
            idNutricionista: user.sub,
          },
        });
        if (!ok) throw new ForbiddenException('Paciente não vinculado a você');
      }
      if (user.perfil === PerfilUsuario.admin_clinica) {
        const wid = requireWorkspaceId(user);
        const ok = await this.prisma.paciente.findFirst({
          where: { id: dto.idPaciente, workspaceId: wid },
        });
        if (!ok) throw new ForbiddenException('Paciente não pertence ao workspace');
      }
      return dto.idPaciente;
    }
    if (user.perfil === 'paciente') return user.sub;
    throw new ForbiddenException('Informe idPaciente ao criar registro');
  }

  async create(
    dto: CreateRegistroDiarioDto,
    user: JwtPayloadUser,
    urlFotoPrato?: string,
  ) {
    const idPaciente = await this.resolveIdPaciente(dto, user);
    const itens = Array.isArray(dto.itens) ? dto.itens : [];
    const registro = await this.prisma.registroDiario.create({
      data: {
        idPaciente,
        registradoEm: new Date(),
        tipoRefeicao: dto.tipoRefeicao ?? null,
        urlFotoPrato: urlFotoPrato ?? null,
        ingestaoAguaMl: dto.ingestaoAguaMl ?? null,
        horasSono: dto.horasSono ?? null,
        pesoKg: dto.pesoKg ?? null,      },
    });
    if (itens.length > 0) {
      await this.prisma.itemConsumido.createMany({
        data: itens.map((item) => ({
          idRegistro: registro.id,
          idAlimento: item.idAlimento,
          quantidadeConsumida: item.quantidadeConsumida ?? null,
          origem: item.origem,
        })),
      });
    }
    return this.prisma.registroDiario.findUnique({
      where: { id: registro.id },
      include: { itensConsumidos: { include: { alimento: true } } },
    });
  }

  /**
   * Análise da foto do prato por visão computacional.
   *
   * Ainda não implementado: devolve `indisponivel` para o app poder dizer ao
   * paciente que o recurso não está pronto, em vez de fingir que analisou
   * (antes retornava `{ placeholder: true }`, que o app tratava como lista
   * vazia de alimentos — pior, porque parecia que a foto não tinha comida).
   */
  async analisarImagemPrato(
    _imageBuffer: Buffer,
  ): Promise<{ disponivel: false; motivo: string }> {
    return {
      disponivel: false,
      motivo:
        'A análise da foto do prato ainda não está disponível. Registre os alimentos pela busca.',
    };
  }
    async remove(user: JwtPayloadUser, id: number) {
    const registro = await this.prisma.registroDiario.findUnique({
      where: { id },
      select: { id: true, idPaciente: true },
    });
    if (!registro) throw new ForbiddenException('Registro não encontrado');

    // Valida vínculo do paciente com o usuário (mesma regra do resolveIdPaciente)
    if (user.perfil === PerfilUsuario.nutricionista) {
      const wid = requireWorkspaceId(user);
      const ok = await this.prisma.paciente.findFirst({
        where: {
          id: registro.idPaciente,
          workspaceId: wid,
          idNutricionista: user.sub,
        },
      });
      if (!ok) throw new ForbiddenException('Paciente não vinculado a você');
    } else if (user.perfil === PerfilUsuario.admin_clinica) {
      const wid = requireWorkspaceId(user);
      const ok = await this.prisma.paciente.findFirst({
        where: { id: registro.idPaciente, workspaceId: wid },
      });
      if (!ok) throw new ForbiddenException('Paciente não pertence ao workspace');
    } else if (user.perfil === 'paciente' && registro.idPaciente !== user.sub) {
      throw new ForbiddenException('Paciente só pode excluir seus próprios registros');
    }

    // Remove os itens consumidos antes (FK)
    await this.prisma.itemConsumido.deleteMany({ where: { idRegistro: id } });
    await this.prisma.registroDiario.delete({ where: { id } });

    return { ok: true, id };
  }
}
