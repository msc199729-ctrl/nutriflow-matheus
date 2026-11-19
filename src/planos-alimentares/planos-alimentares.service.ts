import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PacientesService } from '../pacientes/pacientes.service';
import { CreatePlanoAlimentarDto } from './dto/create-plano-alimentar.dto';
import { UpdatePlanoAlimentarDto } from './dto/update-plano-alimentar.dto';
import {calcularTmbMifflinStJeor,idadeEmAnos,} from '../physical-evaluations/physical-evaluations-calc.service';
import { limparNomeAlimento } from '../foods/foods.service';

/** Remove acentos para o regex funcionar com "Café" e "Cafe". */
function semAcento(texto: string | null | undefined): string {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function horarioParaDate(horario: string): Date {
  const [h, m] = horario.split(':').map((x) => parseInt(x, 10));
  return new Date(1970, 0, 1, h, m, 0, 0);
}

/** Infere horário clínico pelo nome quando o usuário não informa. */
function horarioPorNome(
  nome: string | null | undefined,
  fallback = '12:00',
): Date {
  const n = semAcento(nome);
  if (/cafe|manha|breakfast|desjejum/.test(n)) return horarioParaDate('08:00');
  if (/colacao|colac/.test(n)) return horarioParaDate('10:00');
  if (/almoco|lunch/.test(n)) return horarioParaDate('12:30');
  if (/lanche.*tarde|tarde/.test(n)) return horarioParaDate('16:00');
  if (/jantar|janta|dinner|noite/.test(n)) return horarioParaDate('19:30');
  if (/ceia|supper/.test(n)) return horarioParaDate('22:00');
  if (/pre.*treino|pre.*workout/.test(n)) return horarioParaDate('06:00');
  if (/pos.*treino|pos.*workout/.test(n)) return horarioParaDate('19:00');
  return horarioParaDate(fallback);
}

function formatHorarioDoBanco(d: Date | null): string {
  if (!d) return '12:00';
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

@Injectable()
export class PlanosAlimentaresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pacientesService: PacientesService,
  ) {}

  async findPlanosAtivosByPaciente(user: JwtPayloadUser) {
    if (user.perfil !== 'paciente') {
      throw new ForbiddenException(
        'Apenas o paciente pode consultar seus planos',
      );
    }
    const hoje = new Date();
    return this.prisma.planoAlimentar.findMany({
      where: {
        idPaciente: user.sub,
        ativo: true,
        AND: [
          { OR: [{ dataFim: null }, { dataFim: { gte: hoje } }] },
          { OR: [{ dataInicio: null }, { dataInicio: { lte: hoje } }] },
        ],
      },
      orderBy: { id: 'desc' },
      include: {
        refeicoesPlanejadas: {
          orderBy: { horarioSugerido: 'asc' },
          include: { itensDieta: { include: { alimento: true } } },
        },
      },
    });
  }

  async findPlanoAtivoByPaciente(user: JwtPayloadUser) {
    if (user.perfil !== 'paciente') {
      throw new ForbiddenException(
        'Apenas o paciente pode consultar seu plano ativo',
      );
    }
    const hoje = new Date();
    return this.prisma.planoAlimentar.findFirst({
      where: {
        idPaciente: user.sub,
        ativo: true,
        AND: [
          { OR: [{ dataFim: null }, { dataFim: { gte: hoje } }] },
          { OR: [{ dataInicio: null }, { dataInicio: { lte: hoje } }] },
        ],
      },
      include: {
        refeicoesPlanejadas: {
          orderBy: { horarioSugerido: 'asc' },
          include: {
            itensDieta: { include: { alimento: true } },
          },
        },
      },
    });
  }

  async listByPaciente(idPaciente: number, user: JwtPayloadUser) {
    await this.pacientesService.findOne(idPaciente, user);
    const rows = await this.prisma.planoAlimentar.findMany({
      where: { idPaciente },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        idPaciente: true,
        nome: true,
        tipoPlano: true,
        ativo: true,
        dataInicio: true,
        dataFim: true,
        metaAguaLitros: true,
      },
    });
    return rows.map((p) => ({
      id: p.id,
      idPaciente: p.idPaciente,
      nome: p.nome,
      tipoPlano: p.tipoPlano,
      ativo: p.ativo,
      createdAt: p.dataInicio?.toISOString() ?? null,
      dataFim: p.dataFim?.toISOString() ?? null,
      metaAguaLitros: p.metaAguaLitros,
    }));
  }

  async findOnePlano(id: number, user: JwtPayloadUser) {
    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id },
      include: {
        refeicoesPlanejadas: {
          orderBy: { horarioSugerido: 'asc' },
          include: {
            itensDieta: { include: { alimento: true } },
          },
        },
      },
    });
    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);
    return {
      id: plano.id,
      idPaciente: plano.idPaciente,
      nome: plano.nome,
      tipoPlano: plano.tipoPlano,
      descricaoQualitativa: plano.descricaoQualitativa,
      ativo: plano.ativo,
      metaAguaLitros: plano.metaAguaLitros,
      dataInicio: plano.dataInicio?.toISOString() ?? null,
      dataFim: plano.dataFim?.toISOString() ?? null,
      createdAt: plano.dataInicio?.toISOString() ?? null,
      refeicoes: plano.refeicoesPlanejadas.map((r) => ({
        nome: r.nome ?? '',
        horario: formatHorarioDoBanco(r.horarioSugerido),
        itens: r.itensDieta.map((it) => ({
          idAlimento: it.idAlimento,
          quantidadeGramas: it.quantidadeGramas ?? 0,
          medidaCaseira: it.medidaCaseira ?? null,
          idMedidaCaseira: it.idMedidaCaseira ?? null,
          quantidadeMedida: it.quantidadeMedida ?? null,
          aVontade: it.aVontade,
          alimento: { id: it.alimento.id, nome: it.alimento.nome },
        })),
      })),
    };
  }

  async createPlanoNutricionista(
    dto: CreatePlanoAlimentarDto,
    user: JwtPayloadUser,
  ) {
    if (
      user.perfil !== PerfilUsuario.nutricionista &&
      user.perfil !== PerfilUsuario.admin_clinica
    ) {
      throw new ForbiddenException(
        'Apenas nutricionista ou gestor da clínica pode criar planos',
      );
    }

    const paciente = await this.pacientesService.findOne(dto.idPaciente, user);

    const tipoPlano =
      dto.tipoPlano ??
      (dto.refeicoesPlanejadas?.length ? 'POR_ALIMENTOS' : 'QUALITATIVO');

    // Normaliza o payload já no shape do Prisma.
      const refeicoes = (dto.refeicoesPlanejadas ?? []).map((r) => ({
      nome: r.nome,
      horarioSugerido: r.horarioSugerido
        ? horarioParaDate(r.horarioSugerido)
        : horarioPorNome(r.nome),
      itensDieta: (r.itensDieta ?? []).map((i) => ({
        idAlimento: i.idAlimento,
        quantidadeGramas: i.quantidadeGramas ?? null,
        medidaCaseira: i.medidaCaseira ?? null,
        idMedidaCaseira: i.idMedidaCaseira ?? null,
        quantidadeMedida: i.quantidadeMedida ?? null,
        aVontade: i.aVontade ?? false,
        idGrupoSubstituicao: i.idGrupoSubstituicao ?? null,
      })),
    }));

    if (tipoPlano === 'POR_ALIMENTOS' && refeicoes.length === 0) {
      throw new BadRequestException(
        'Plano por alimentos precisa de ao menos uma refeição.',
      );
    }

    const nomes = refeicoes
      .map((r) => (r.nome ?? '').trim().toLowerCase())
      .filter((n) => n.length > 0);
    const repetido = nomes.find((n, i) => nomes.indexOf(n) !== i);
    if (repetido) {
      throw new BadRequestException(
        `Refeição duplicada no plano: "${repetido}". Renomeie antes de salvar.`,
      );
    }

    const semCalorias = refeicoes.find(
      (r) =>
        r.itensDieta.filter(
          (i) => !i.aVontade && (i.quantidadeGramas ?? 0) > 0,
        ).length === 0,
    );
    if (semCalorias) {
      throw new BadRequestException(
        `Refeição "${semCalorias.nome}" não tem alimentos com quantidade. Adicione ou remova.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      return tx.planoAlimentar.create({
        data: {
          idPaciente: dto.idPaciente,
          idNutricionista: paciente.idNutricionista,
          nome: dto.nome ?? null,
          tipoPlano,
          descricaoQualitativa: dto.descricaoQualitativa ?? null,
          ativo: true,
          dataInicio: new Date(),
          metaAguaLitros: dto.metaAguaLitros ?? null,
          refeicoesPlanejadas:
            tipoPlano === 'POR_ALIMENTOS' && refeicoes.length > 0
              ? {
                  create: refeicoes.map((r) => ({
                    nome: r.nome,
                    horarioSugerido: r.horarioSugerido,
                    itensDieta: { create: r.itensDieta },
                  })),
                }
              : undefined,
        },
        include: {
          refeicoesPlanejadas: {
            orderBy: { horarioSugerido: 'asc' },
            include: {
              itensDieta: { include: { alimento: true } },
            },
          },
        },
      });
    });
  }

  /** Exclui um plano. Não promove nenhum outro automaticamente. */
  async removePlano(id: number, user: JwtPayloadUser) {
    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id },
      select: { idPaciente: true },
    });
    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);

    await this.prisma.planoAlimentar.delete({ where: { id } });
    return { ok: true, id };
  }

  /**
   * Duplica como RASCUNHO (inativo).
   * O plano atual do paciente continua no ar até você promover a cópia.
   */
  async duplicarPlano(id: number, user: JwtPayloadUser) {
    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id },
      include: {
        refeicoesPlanejadas: {
          orderBy: { horarioSugerido: 'asc' },
          include: { itensDieta: true },
        },
      },
    });
    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);

    // Mantém nome + " (cópia)" dentro do limite de 80 do DTO de renomear.
    const base = (plano.nome ?? 'Plano').slice(0, 70);

    return this.prisma.planoAlimentar.create({
      data: {
        idPaciente: plano.idPaciente,
        idNutricionista: plano.idNutricionista,
        nome: `${base} (cópia)`,
        tipoPlano: plano.tipoPlano,
        descricaoQualitativa: plano.descricaoQualitativa,
        ativo: false,
        dataInicio: new Date(),
        metaAguaLitros: plano.metaAguaLitros,
        refeicoesPlanejadas: {
          create: plano.refeicoesPlanejadas.map((r) => ({
            nome: r.nome,
            horarioSugerido: r.horarioSugerido,
            itensDieta: {
              create: r.itensDieta.map((i) => ({
                idAlimento: i.idAlimento,
                quantidadeGramas: i.quantidadeGramas,
                medidaCaseira: i.medidaCaseira,
                idMedidaCaseira: i.idMedidaCaseira,
                quantidadeMedida: i.quantidadeMedida,
                aVontade: i.aVontade,
                idGrupoSubstituicao: i.idGrupoSubstituicao,
              })),
            },
          })),
        },
      },
      include: { refeicoesPlanejadas: { include: { itensDieta: true } } },
    });
  }

  /** Liga ou desliga um plano. Não mexe nos outros. */
  async definirDisponibilidade(
    id: number,
    ativo: boolean,
    user: JwtPayloadUser,
  ) {
    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id },
      select: { idPaciente: true },
    });
    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);

    return this.prisma.planoAlimentar.update({
      where: { id },
      data: { ativo },
      select: { id: true, ativo: true },
    });
  }

  /** Renomeia apenas o nome do plano. Não toca em refeições, itens ou disponibilidade. */
  async renomearPlano(id: number, nome: string, user: JwtPayloadUser) {
    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id },
      select: { idPaciente: true },
    });
    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);

    const limpo = nome?.trim();
    if (!limpo) {
      throw new BadRequestException('O nome do plano não pode ficar vazio.');
    }

    return this.prisma.planoAlimentar.update({
      where: { id },
      data: { nome: limpo },
      select: { id: true, nome: true },
    });
  }
  /**
   * Edita o plano. Se `refeicoesPlanejadas` vier no payload, substitui TODAS
   * as refeições (apaga e recria). Sem esse campo, só os dados do plano mudam.
   */
    async atualizarPlano(
    id: number,
    dto: UpdatePlanoAlimentarDto,
    user: JwtPayloadUser,
  ) {
    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id },
      select: { id: true, idPaciente: true, tipoPlano: true },
    });
    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);

    const tipoPlano = dto.tipoPlano ?? plano.tipoPlano;

    if (dto.refeicoesPlanejadas) {
      const refeicoes = dto.refeicoesPlanejadas.map((r) => ({
        nome: r.nome,
        horarioSugerido: r.horarioSugerido
          ? horarioParaDate(r.horarioSugerido)
          : horarioPorNome(r.nome),
        itensDieta: (r.itensDieta ?? []).map((i) => ({
          idAlimento: i.idAlimento,
          quantidadeGramas: i.quantidadeGramas ?? null,
          medidaCaseira: i.medidaCaseira ?? null,
          idMedidaCaseira: i.idMedidaCaseira ?? null,
          quantidadeMedida: i.quantidadeMedida ?? null,
          aVontade: i.aVontade ?? false,
          idGrupoSubstituicao: i.idGrupoSubstituicao ?? null,
        })),
      }));

      if (tipoPlano === 'POR_ALIMENTOS' && refeicoes.length === 0) {
        throw new BadRequestException(
          'Plano por alimentos precisa de ao menos uma refeição.',
        );
      }

      const nomes = refeicoes
        .map((r) => (r.nome ?? '').trim().toLowerCase())
        .filter((n) => n.length > 0);
      const repetido = nomes.find((n, i) => nomes.indexOf(n) !== i);
      if (repetido) {
        throw new BadRequestException(
          `Refeição duplicada no plano: "${repetido}". Renomeie antes de salvar.`,
        );
      }

      const semCalorias = refeicoes.find(
        (r) =>
          r.itensDieta.filter(
            (i) => !i.aVontade && (i.quantidadeGramas ?? 0) > 0,
          ).length === 0,
      );
      if (semCalorias) {
        throw new BadRequestException(
          `Refeição "${semCalorias.nome}" não tem alimentos com quantidade. Adicione ou remova.`,
        );
      }

      return this.prisma.$transaction(async (tx) => {
        return tx.planoAlimentar.update({
          where: { id },
          data: {
            ...(dto.nome !== undefined
              ? { nome: dto.nome?.trim() || null }
              : {}),
            ...(dto.tipoPlano !== undefined ? { tipoPlano } : {}),
            ...(dto.descricaoQualitativa !== undefined
              ? { descricaoQualitativa: dto.descricaoQualitativa }
              : {}),
            ...(dto.metaAguaLitros !== undefined
              ? { metaAguaLitros: dto.metaAguaLitros }
              : {}),
            refeicoesPlanejadas: {
              deleteMany: {},
              create: refeicoes.map((r) => ({
                nome: r.nome,
                horarioSugerido: r.horarioSugerido,
                itensDieta: { create: r.itensDieta },
              })),
            },
          },
          include: {
            refeicoesPlanejadas: {
              orderBy: { horarioSugerido: 'asc' },
              include: {
                itensDieta: { include: { alimento: true } },
              },
            },
          },
        });
      });
    }

    return this.prisma.planoAlimentar.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome?.trim() || null } : {}),
        ...(dto.tipoPlano !== undefined ? { tipoPlano } : {}),
        ...(dto.descricaoQualitativa !== undefined
          ? { descricaoQualitativa: dto.descricaoQualitativa }
          : {}),
        ...(dto.metaAguaLitros !== undefined
          ? { metaAguaLitros: dto.metaAguaLitros }
          : {}),
      },
      include: {
        refeicoesPlanejadas: {
          orderBy: { horarioSugerido: 'asc' },
          include: {
            itensDieta: { include: { alimento: true } },
          },
        },
      },
    });
  }
  /** Todos os planos disponíveis do paciente (pode haver mais de um). */
  async findPlanosDisponiveisByPaciente(user: JwtPayloadUser) {
    if (user.perfil !== 'paciente') {
      throw new ForbiddenException(
        'Apenas o paciente pode consultar seus planos',
      );
    }
    return this.prisma.planoAlimentar.findMany({
      where: { idPaciente: user.sub, ativo: true },
      orderBy: { dataInicio: 'desc' },
      include: {
        refeicoesPlanejadas: {
          orderBy: { horarioSugerido: 'asc' },
          include: { itensDieta: { include: { alimento: true } } },
        },
      },
    });
  }

  async getShoppingList(idPlano: number, user: JwtPayloadUser) {
    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id: idPlano },
      include: {
        refeicoesPlanejadas: {
          include: {
            itensDieta: { include: { alimento: true } },
          },
        },
      },
    });
    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);

    const map = new Map<
      number,
      {
        idAlimento: number;
        nome: string;
        nomeExibicao: string;
        totalGramas: number;
        aVontade: boolean;
      }
    >();

    for (const ref of plano.refeicoesPlanejadas) {
      for (const item of ref.itensDieta) {
        const existing = map.get(item.idAlimento);
        if (existing) {
          existing.totalGramas += item.quantidadeGramas ?? 0;
          if (item.aVontade) existing.aVontade = true;
        } else {
          map.set(item.idAlimento, {
            idAlimento: item.idAlimento,
            nome: item.alimento.nome,
            nomeExibicao: limparNomeAlimento(item.alimento.nome),
            totalGramas: item.quantidadeGramas ?? 0,
            aVontade: item.aVontade,
          });
        }
      }
    }

    return {
      idPlano: plano.id,
      nomePlano: plano.nome,
      itens: [...map.values()].sort((a, b) =>
        a.nomeExibicao.localeCompare(b.nomeExibicao, 'pt-BR'),
      ),
    };
  }

  /** Resumo do plano: Prescrito vs Necessidade Alvo (TMB × 1.55). */
  async getResumoComparativo(idPlano: number, user: JwtPayloadUser) {
    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id: idPlano },
      include: {
        paciente: { select: { dataNascimento: true, genero: true } },
        refeicoesPlanejadas: {
          include: {
            itensDieta: { include: { alimento: true } },
          },
        },
      },
    });
    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);

    let totalKcal = 0;
    let totalPtn = 0;
    let totalCho = 0;
    let totalLip = 0;

    for (const ref of plano.refeicoesPlanejadas) {
      for (const item of ref.itensDieta) {
        const fator = (item.quantidadeGramas ?? 0) / 100;
        totalKcal += (item.alimento.calorias ?? 0) * fator;
        totalPtn += (item.alimento.proteinas ?? 0) * fator;
        totalCho += (item.alimento.carboidratos ?? 0) * fator;
        totalLip += (item.alimento.gorduras ?? 0) * fator;
      }
    }

    const ultimaAvaliacao = await this.prisma.avaliacaoFisica.findFirst({
      where: { idPaciente: plano.idPaciente },
      orderBy: { data: 'desc' },
      select: { peso: true, altura: true },
    });

    let alvoKcal: number | null = null;
    let alvoPtn: number | null = null;
    let alvoCho: number | null = null;
    let alvoLip: number | null = null;

    const peso = ultimaAvaliacao?.peso;
    const alturaM = ultimaAvaliacao?.altura;
    const idade = idadeEmAnos(plano.paciente.dataNascimento);

    if (peso && alturaM && idade != null) {
      const tmb = calcularTmbMifflinStJeor(
        peso,
        alturaM > 3 ? alturaM : alturaM * 100,
        idade,
        plano.paciente.genero,
      );
      alvoKcal = Math.round(tmb * 1.55);
      alvoPtn = Math.round((alvoKcal * 0.2) / 4);
      alvoCho = Math.round((alvoKcal * 0.55) / 4);
      alvoLip = Math.round((alvoKcal * 0.25) / 9);
    }

    return {
      idPlano: plano.id,
      prescrito: {
        kcal: Math.round(totalKcal),
        proteinas: Math.round(totalPtn),
        carboidratos: Math.round(totalCho),
        gorduras: Math.round(totalLip),
      },
      alvo: {
        kcal: alvoKcal,
        proteinas: alvoPtn,
        carboidratos: alvoCho,
        gorduras: alvoLip,
      },
    };
  }
}