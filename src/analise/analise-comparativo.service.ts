import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MacrosComparativo {
  kcal: number;
  proteina: number;
  carboidrato: number;
  gordura: number;
  fibra: number;
}

/** Refeição do plano — valores são METAS DIÁRIAS. */
export interface RefeicaoPrescrita extends MacrosComparativo {
  nome: string;
  horario: string | null;
  itens: number;
}

/** Refeição consumida — valores normalizados por dia. */
export interface RefeicaoConsumida extends MacrosComparativo {
  nome: string;
  /** Soma bruta de kcal no período (auditoria). */
  totalKcal: number;
  /** Quantidade de REGISTROS desse tipo de refeição no período. */
  ocorrencias: number;
}

export interface MacroDesvio {
  kcal: number | null;
  proteina: number | null;
  carboidrato: number | null;
  gordura: number | null;
  fibra: number | null;
}

export interface ComparativoResponse {
  pacienteId: number;
  periodoDias: number;
  planoId: number | null;
  planoNome: string | null;
  prescrito: {
    /** Meta DIÁRIA do plano. */
    total: MacrosComparativo;
    refeicoes: RefeicaoPrescrita[];
  };
  consumido: {
    /** Soma bruta do período. NÃO comparar com o prescrito. */
    total: MacrosComparativo;
    /** Média DIÁRIA do período. É o valor comparável. */
    media: MacrosComparativo;
    refeicoes: RefeicaoConsumida[];
    registros: number;
    /** Quantos dias distintos tiveram ao menos um registro. */
    diasComRegistro: number;
  };
  desvio: MacroDesvio;
}

const ZERO: MacrosComparativo = {
  kcal: 0,
  proteina: 0,
  carboidrato: 0,
  gordura: 0,
  fibra: 0,
};

function soma(lista: MacrosComparativo[]): MacrosComparativo {
  return lista.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      proteina: acc.proteina + m.proteina,
      carboidrato: acc.carboidrato + m.carboidrato,
      gordura: acc.gordura + m.gordura,
      fibra: acc.fibra + m.fibra,
    }),
    { ...ZERO },
  );
}

function dividir(m: MacrosComparativo, n: number): MacrosComparativo {
  if (!n || n <= 0) return { ...ZERO };
  return {
    kcal: m.kcal / n,
    proteina: m.proteina / n,
    carboidrato: m.carboidrato / n,
    gordura: m.gordura / n,
    fibra: m.fibra / n,
  };
}

function macrosDe(
  gramas: number,
  a: {
    calorias: number | null;
    proteinas: number | null;
    carboidratos: number | null;
    gorduras: number | null;
    fibras: number | null;
  },
): MacrosComparativo {
  const f = gramas / 100;
  return {
    kcal: (a.calorias ?? 0) * f,
    proteina: (a.proteinas ?? 0) * f,
    carboidrato: (a.carboidratos ?? 0) * f,
    gordura: (a.gorduras ?? 0) * f,
    fibra: (a.fibras ?? 0) * f,
  };
}

function desvioPercentual(
  prescrito: number,
  consumido: number,
): number | null {
  if (!prescrito || prescrito <= 0) return null;
  return ((consumido - prescrito) / prescrito) * 100;
}

/**
 * Horário de PAREDE salvo como Date.
 * Usa getHours() local para bater com o formatHorarioDoBanco do
 * planos-alimentares.service — os dois endpoints leem o mesmo horário.
 */
function horaDe(data: Date | null): string | null {
  if (!data) return null;
  const h = data.getHours();
  const m = data.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Dia local (YYYY-MM-DD) — um registro às 22h não pula para o dia seguinte. */
function diaDe(data: Date | null): string | null {
  if (!data) return null;
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

const SELECT_ALIMENTO = {
  id: true,
  nome: true,
  nomeExibicao: true,
  calorias: true,
  proteinas: true,
  carboidratos: true,
  gorduras: true,
  fibras: true,
} as const;

@Injectable()
export class AnaliseComparativoService {
  constructor(private readonly prisma: PrismaService) {}

  async comparativo(
    idPaciente: number,
    dias = 7,
  ): Promise<ComparativoResponse> {
    const periodoDias = Math.max(1, Number(dias) || 7);

    const plano = await this.prisma.planoAlimentar.findFirst({
      where: {
        idPaciente,
        ativo: true,
        refeicoesPlanejadas: { some: {} },
      },
      orderBy: { id: 'desc' },
      include: {
        refeicoesPlanejadas: {
          include: {
            itensDieta: {
              include: { alimento: { select: SELECT_ALIMENTO } },
            },
          },
        },
      },
    });

    const prescritoRefeicoes: RefeicaoPrescrita[] = (
      plano?.refeicoesPlanejadas ?? []
    ).map((r) => {
      const macros = soma(
        r.itensDieta
          .filter((i) => !i.aVontade)
          .map((i) => macrosDe(Number(i.quantidadeGramas ?? 0), i.alimento)),
      );

      return {
        nome: r.nome ?? 'Refeição',
        horario: horaDe(r.horarioSugerido ?? null),
        itens: r.itensDieta.length,
        ...macros,
      };
    });

    const prescritoTotal = soma(prescritoRefeicoes);

    const desde = new Date();
    desde.setDate(desde.getDate() - periodoDias);

    const registros = await this.prisma.registroDiario.findMany({
      where: {
        idPaciente,
        registradoEm: { gte: desde },
      },
      include: {
        itensConsumidos: {
          include: { alimento: { select: SELECT_ALIMENTO } },
        },
      },
    });

    // Agrupa macros de TODO o período por tipo, guardando também
    // quantos REGISTROS (refeições) alimentaram cada grupo.
    const porTipo = new Map<
      string,
      { macros: MacrosComparativo[]; refeicoes: number }
    >();
    const diasSet = new Set<string>();

    for (const reg of registros) {
      const dia = diaDe(reg.registradoEm ?? null);
      if (dia) diasSet.add(dia);

      const tipo = (reg.tipoRefeicao ?? 'sem-tipo').toLowerCase().trim();
      if (!porTipo.has(tipo)) porTipo.set(tipo, { macros: [], refeicoes: 0 });

      const bucket = porTipo.get(tipo)!;
      let temItemValido = false;

      for (const item of reg.itensConsumidos) {
        const gramas = Number(item.quantidadeConsumida ?? 0);
        if (gramas <= 0) continue;
        bucket.macros.push(macrosDe(gramas, item.alimento));
        temItemValido = true;
      }

      // Conta a REFEIÇÃO, não os itens dentro dela
      if (temItemValido) bucket.refeicoes += 1;
    }

    // Totais BRUTOS de cada refeição, antes de normalizar.
    const brutosPorRefeicao = Array.from(porTipo.entries()).map(
      ([nome, bucket]) => ({
        nome,
        total: soma(bucket.macros),
        ocorrencias: bucket.refeicoes,
      }),
    );

    // Soma os totais BRUTOS (nunca os já divididos).
    const consumidoTotal = soma(brutosPorRefeicao.map((r) => r.total));
    const consumidoMedia = dividir(consumidoTotal, periodoDias);

    const consumidoRefeicoes: RefeicaoConsumida[] = brutosPorRefeicao.map(
      (r) => ({
        nome: r.nome,
        ...dividir(r.total, periodoDias),
        totalKcal: r.total.kcal,
        ocorrencias: r.ocorrencias,
      }),
    );

    const desvio: MacroDesvio = {
      kcal: desvioPercentual(prescritoTotal.kcal, consumidoMedia.kcal),
      proteina: desvioPercentual(
        prescritoTotal.proteina,
        consumidoMedia.proteina,
      ),
      carboidrato: desvioPercentual(
        prescritoTotal.carboidrato,
        consumidoMedia.carboidrato,
      ),
      gordura: desvioPercentual(prescritoTotal.gordura, consumidoMedia.gordura),
      fibra: desvioPercentual(prescritoTotal.fibra, consumidoMedia.fibra),
    };

    return {
      pacienteId: idPaciente,
      periodoDias,
      planoId: plano?.id ?? null,
      planoNome: plano?.nome ?? null,
      prescrito: {
        total: prescritoTotal,
        refeicoes: prescritoRefeicoes,
      },
      consumido: {
        total: consumidoTotal,
        media: consumidoMedia,
        refeicoes: consumidoRefeicoes,
        registros: registros.length,
        diasComRegistro: diasSet.size,
      },
      desvio,
    };
  }
}