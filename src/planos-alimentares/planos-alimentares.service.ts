import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PacientesService } from '../pacientes/pacientes.service';
import { CreatePlanoAlimentarDto } from './dto/create-plano-alimentar.dto';
import {
  calcularTmbMifflinStJeor,
  idadeEmAnos,
} from '../physical-evaluations/physical-evaluations-calc.service';
import { limparNomeAlimento } from '../foods/foods.service';

function horarioParaDate(horario: string): Date {
  const [h, m] = horario.split(':').map((x) => parseInt(x, 10));
  return new Date(1970, 0, 1, h, m, 0, 0);
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

  async findPlanoAtivoByPaciente(user: JwtPayloadUser) {
    if (user.perfil !== 'paciente') {
      throw new ForbiddenException('Apenas o paciente pode consultar seu plano ativo');
    }
    const hoje = new Date();
    const plano = await this.prisma.planoAlimentar.findFirst({
      where: {
        idPaciente: user.sub,
        ativo: true,
        AND: [
          {
            OR: [{ dataFim: null }, { dataFim: { gte: hoje } }],
          },
          {
            OR: [{ dataInicio: null }, { dataInicio: { lte: hoje } }],
          },
        ],
      },
      include: {
        refeicoesPlanejadas: {
          orderBy: { horarioSugerido: 'asc' },
          include: {
            itensDieta: {
              include: { alimento: true },
            },
          },
        },
      },
    });
    return plano;
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
    if (!plano) {
      throw new NotFoundException('Plano não encontrado');
    }
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
          aVontade: it.aVontade,
          alimento: { id: it.alimento.id, nome: it.alimento.nome },
        })),
      })),
    };
  }

  async createPlanoNutricionista(dto: CreatePlanoAlimentarDto, user: JwtPayloadUser) {
    if (
      user.perfil !== PerfilUsuario.nutricionista &&
      user.perfil !== PerfilUsuario.admin_clinica
    ) {
      throw new ForbiddenException('Apenas nutricionista ou gestor da clínica pode criar planos');
    }

    const paciente = await this.pacientesService.findOne(dto.idPaciente, user);

    return this.prisma.$transaction(async (tx) => {
      await tx.planoAlimentar.updateMany({
        where: { idPaciente: dto.idPaciente, ativo: true },
        data: { ativo: false },
      });

      const refeicoesPlanejadas =
        dto.tipoPlano === 'POR_ALIMENTOS' && dto.refeicoes?.length
          ? {
              create: dto.refeicoes.map((r) => ({
                nome: r.nome,
                horarioSugerido: horarioParaDate(r.horario),
                itensDieta: {
                  create: r.itens.map((i) => ({
                    idAlimento: i.idAlimento,
                    quantidadeGramas: i.quantidadeGramas ?? null,
                    medidaCaseira: i.medidaCaseira ?? null,
                    aVontade: i.aVontade ?? false,
                    idGrupoSubstituicao: i.idGrupoSubstituicao ?? null,
                  })),
                },
              })),
            }
          : undefined;

      return tx.planoAlimentar.create({
        data: {
          idPaciente: dto.idPaciente,
          idNutricionista: paciente.idNutricionista,
          nome: dto.nome ?? null,
          tipoPlano: dto.tipoPlano,
          descricaoQualitativa: dto.descricaoQualitativa ?? null,
          ativo: true,
          dataInicio: new Date(),
          metaAguaLitros: dto.metaAguaLitros ?? null,
          refeicoesPlanejadas,
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

  /**
   * Gera lista de compras consolidada: soma quantidades por alimento.
   */
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

    const map = new Map<number, {
      idAlimento: number;
      nome: string;
      nomeExibicao: string;
      totalGramas: number;
      aVontade: boolean;
    }>();

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

  /**
   * Retorna resumo do plano com comparação Prescrito vs Necessidade Alvo.
   * O alvo é baseado na TMB (Mifflin-St Jeor) × fator atividade padrão 1.55.
   */
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
        const g = item.quantidadeGramas ?? 0;
        const fator = g / 100;
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
      const alturaCm = alturaM * 100;
      const tmb = calcularTmbMifflinStJeor(peso, alturaCm, idade, plano.paciente.genero);
      const fatorAtividade = 1.55;
      alvoKcal = Math.round(tmb * fatorAtividade);
      // Distribuição padrão: PTN 20%, CHO 55%, LIP 25%
      alvoPtn = Math.round((alvoKcal * 0.20) / 4);
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
