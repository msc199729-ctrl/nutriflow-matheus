import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCalculoDto } from './dto/create-calculo.dto';
import { calcular, FormulaId, NivelEer } from './formulas';

@Injectable()
export class CalculoEnergeticoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Prévia sem gravar. Alimenta o formulário enquanto o usuário digita. */
  previsto(dto: CreateCalculoDto) {
    return calcular(dto.formula as FormulaId, {
      pesoKg: dto.pesoKg,
      alturaCm: dto.alturaCm,
      idadeAnos: dto.idadeAnos,
      sexo: dto.sexo,
      massaMagraKg: dto.massaMagraKg ?? null,
      fatorAtividade: dto.fatorAtividade ?? 1.55,
      fatorInjuria: dto.fatorInjuria ?? 1,
      eerNivel: (dto.eerNivel as NivelEer) ?? 'BAIXO',
      adicionalMet: dto.adicionalMet ?? 0,
      adicionalVenta: dto.adicionalVenta ?? 0,
      adicionalGestante: dto.adicionalGestante ?? 0,
      tmbManual: dto.tmbManual ?? null,
      getManual: dto.getManual ?? null,
    });
  }

  /**
   * Grava o cálculo do paciente. Um cálculo por paciente: se já existe,
   * atualiza em vez de acumular histórico, para o valor teórico do plano
   * refletir sempre a última avaliação.
   */
  async salvar(dto: CreateCalculoDto) {
    const resultado = this.previsto(dto);

    const dados = {
      pesoKg: dto.pesoKg,
      alturaCm: dto.alturaCm,
      idadeAnos: dto.idadeAnos,
      sexo: dto.sexo,
      massaMagraKg: dto.massaMagraKg ?? null,
      formula: dto.formula,
      fatorAtividade: dto.fatorAtividade ?? 1.55,
      fatorInjuria: dto.fatorInjuria ?? 1,
      eerNivel: dto.eerNivel ?? null,
      adicionalMet: dto.adicionalMet ?? null,
      adicionalVenta: dto.adicionalVenta ?? null,
      adicionalGestante: dto.adicionalGestante ?? null,
      tmbKcal: resultado.tmb,
      getKcal: resultado.get,
    };

    const existente = await this.prisma.calculoEnergetico.findFirst({
      where: { idPaciente: dto.idPaciente },
    });

    if (existente) {
      return this.prisma.calculoEnergetico.update({
        where: { id: existente.id },
        data: dados,
      });
    }

    return this.prisma.calculoEnergetico.create({
      data: { ...dados, idPaciente: dto.idPaciente },
    });
  }

  async porPaciente(idPaciente: number) {
    return this.prisma.calculoEnergetico.findFirst({
      where: { idPaciente },
      orderBy: { atualizadoEm: 'desc' },
    });
  }

  async definirDistribuicao(
    id: number,
    dados: {
      metodoDistribuicao: string;
      proteinasGKg?: number | null;
      lipidiosGKg?: number | null;
      carboidratosGKg?: number | null;
      proteinasPct?: number | null;
      lipidiosPct?: number | null;
      carboidratosPct?: number | null;
    },
  ) {
    const existe = await this.prisma.calculoEnergetico.findUnique({
      where: { id },
    });
    if (!existe) throw new NotFoundException('Cálculo não encontrado');

    return this.prisma.calculoEnergetico.update({
      where: { id },
      data: {
        metodoDistribuicao: dados.metodoDistribuicao,
        proteinasGKg: dados.proteinasGKg ?? null,
        lipidiosGKg: dados.lipidiosGKg ?? null,
        carboidratosGKg: dados.carboidratosGKg ?? null,
        proteinasPct: dados.proteinasPct ?? null,
        lipidiosPct: dados.lipidiosPct ?? null,
        carboidratosPct: dados.carboidratosPct ?? null,
      },
    });
  }

  async vincularAoPlano(id: number, idPlanoAlimentar: number) {
    return this.prisma.calculoEnergetico.update({
      where: { id },
      data: { idPlanoAlimentar },
    });
  }
}