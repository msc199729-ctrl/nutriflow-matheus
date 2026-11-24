/**
 * Micronutrientes: definição, referências (DRI) e agregação de plano alimentar.
 *
 * Este módulo é puro (sem Prisma, sem Nest) para poder ser testado isolado.
 *
 * FONTES DOS VALORES DE REFERÊNCIA
 * - IOM/National Academies, Dietary Reference Intakes (DRI), compilado pelo
 *   NIH Office of Dietary Supplements.
 *   https://nutritionsource.hsph.harvard.edu/vitamins  (tabela "Recommended Daily
 *   Intake of Vitamins and Minerals for Adults", derivada de IOM DRI)
 * - Adultos 19-50, salvo indicado. RDA em negrito, AI marcada com (*).
 *
 * LIMITAÇÕES CONHECIDAS (documentar na UI, não esconder)
 * - A TBCA NÃO traz vitamina K, B5 (pantotênico), biotina nem manganês/cromo/iodo
 *   com cobertura confiável. Esses nutrientes ficam fora do painel.
 * - Niacina da TBCA é mg total; a DRI é mg NE (equivalentes de niacina). Aproximação.
 * - Folato da TBCA é "equivalente de folato" (mcg); a DRI é mcg DFE. Aproximação.
 * - Vitamina A: usar RAE (padrão atual), não RE.
 * - Gorduras: a TBCA não separa ômega-3/ômega-6, então não dá para comparar com a
 *   recomendação específica de ácidos graxos essenciais.
 */

export type SexoDri = 'M' | 'F';

export interface ContextoDri {
  sexo: SexoDri;
  idadeAnos: number;
  gestante?: boolean;
  lactante?: boolean;
}

export type GrupoNutriente = 'minerais' | 'vitaminas' | 'gorduras';

export type TipoReferencia = 'RDA' | 'AI' | 'LIMITE' | 'PERCENTUAL_ENERGIA' | 'SEM_REFERENCIA';

export interface DefinicaoNutriente {
  /** chave usada no banco e no payload (camelCase) */
  chave: string;
  rotulo: string;
  unidade: string;
  grupo: GrupoNutriente;
  /** nome do componente no dump da TBCA */
  componenteTbca: string;
  /** nome do campo no model BaseAlimento do Prisma */
  campoPrisma: string;
  ordem: number;
}

/**
 * Nutrientes expostos no painel. A ordem define a exibição.
 * 23 nutrientes: 8 minerais, 10 vitaminas, 5 gorduras.
 */
export const NUTRIENTES: DefinicaoNutriente[] = [
  // ── Minerais ────────────────────────────────────────────────────────────
  { chave: 'calcio', rotulo: 'Cálcio', unidade: 'mg', grupo: 'minerais', componenteTbca: 'Cálcio', campoPrisma: 'calcio', ordem: 10 },
  { chave: 'ferro', rotulo: 'Ferro', unidade: 'mg', grupo: 'minerais', componenteTbca: 'Ferro', campoPrisma: 'ferro', ordem: 20 },
  { chave: 'magnesio', rotulo: 'Magnésio', unidade: 'mg', grupo: 'minerais', componenteTbca: 'Magnésio', campoPrisma: 'magnesio', ordem: 30 },
  { chave: 'fosforo', rotulo: 'Fósforo', unidade: 'mg', grupo: 'minerais', componenteTbca: 'Fósforo', campoPrisma: 'fosforo', ordem: 40 },
  { chave: 'potassio', rotulo: 'Potássio', unidade: 'mg', grupo: 'minerais', componenteTbca: 'Potássio', campoPrisma: 'potassio', ordem: 50 },
  { chave: 'zinco', rotulo: 'Zinco', unidade: 'mg', grupo: 'minerais', componenteTbca: 'Zinco', campoPrisma: 'zinco', ordem: 60 },
  { chave: 'cobre', rotulo: 'Cobre', unidade: 'mg', grupo: 'minerais', componenteTbca: 'Cobre', campoPrisma: 'cobre', ordem: 70 },
  { chave: 'selenio', rotulo: 'Selênio', unidade: 'mcg', grupo: 'minerais', componenteTbca: 'Selênio', campoPrisma: 'selenio', ordem: 80 },

  // ── Vitaminas ───────────────────────────────────────────────────────────
  // Vitamina A usa RAE (padrão atual da DRI). O schema também tem RE;
  // RAE é o campo que interessa para comparar com a recomendação.
  { chave: 'vitaminaA', rotulo: 'Vitamina A', unidade: 'mcg', grupo: 'vitaminas', componenteTbca: 'Vitamina A (RAE)', campoPrisma: 'vitaminaARae', ordem: 110 },
  { chave: 'vitaminaC', rotulo: 'Vitamina C', unidade: 'mg', grupo: 'vitaminas', componenteTbca: 'Vitamina C', campoPrisma: 'vitaminaC', ordem: 120 },
  { chave: 'vitaminaD', rotulo: 'Vitamina D', unidade: 'mcg', grupo: 'vitaminas', componenteTbca: 'Vitamina D', campoPrisma: 'vitaminaD', ordem: 130 },
  { chave: 'vitaminaE', rotulo: 'Vitamina E', unidade: 'mg', grupo: 'vitaminas', componenteTbca: 'Alfa-tocoferol (Vitamina E)', campoPrisma: 'vitaminaE', ordem: 140 },
  { chave: 'tiamina', rotulo: 'Tiamina (B1)', unidade: 'mg', grupo: 'vitaminas', componenteTbca: 'Tiamina', campoPrisma: 'tiamina', ordem: 150 },
  { chave: 'riboflavina', rotulo: 'Riboflavina (B2)', unidade: 'mg', grupo: 'vitaminas', componenteTbca: 'Riboflavina', campoPrisma: 'vitaminaB2', ordem: 160 },
  { chave: 'niacina', rotulo: 'Niacina (B3)', unidade: 'mg', grupo: 'vitaminas', componenteTbca: 'Niacina', campoPrisma: 'vitaminaB3', ordem: 170 },
  { chave: 'vitaminaB6', rotulo: 'Vitamina B6', unidade: 'mg', grupo: 'vitaminas', componenteTbca: 'Vitamina B6', campoPrisma: 'vitaminaB6', ordem: 180 },
  { chave: 'vitaminaB12', rotulo: 'Vitamina B12', unidade: 'mcg', grupo: 'vitaminas', componenteTbca: 'Vitamina B12', campoPrisma: 'vitaminaB12', ordem: 190 },
  { chave: 'folato', rotulo: 'Folato (B9)', unidade: 'mcg', grupo: 'vitaminas', componenteTbca: 'Equivalente de folato', campoPrisma: 'folato', ordem: 200 },

  // ── Gorduras ────────────────────────────────────────────────────────────
  { chave: 'agSaturados', rotulo: 'Saturados', unidade: 'g', grupo: 'gorduras', componenteTbca: 'Ácidos graxos saturados', campoPrisma: 'gorduraSaturada', ordem: 210 },
  { chave: 'agMonoinsaturados', rotulo: 'Monoinsaturados', unidade: 'g', grupo: 'gorduras', componenteTbca: 'Ácidos graxos monoinsaturados', campoPrisma: 'gorduraMonoinsaturada', ordem: 220 },
  { chave: 'agPoliinsaturados', rotulo: 'Poliinsaturados', unidade: 'g', grupo: 'gorduras', componenteTbca: 'Ácidos graxos poliinsaturados', campoPrisma: 'gorduraPoliinsaturada', ordem: 230 },
  { chave: 'agTrans', rotulo: 'Trans', unidade: 'g', grupo: 'gorduras', componenteTbca: 'Ácidos graxos trans', campoPrisma: 'gorduraTrans', ordem: 240 },
  { chave: 'colesterol', rotulo: 'Colesterol', unidade: 'mg', grupo: 'gorduras', componenteTbca: 'Colesterol', campoPrisma: 'colesterol', ordem: 250 },
];

/** Índice componenteTbca -> chave (para leitura/agregação). */
export const CHAVE_POR_COMPONENTE_TBCA: Record<string, string> = Object.fromEntries(
  NUTRIENTES.map((n) => [n.componenteTbca, n.chave]),
);

/** Índice componenteTbca -> campo do Prisma (para gravar no banco). */
export const CAMPO_POR_COMPONENTE_TBCA: Record<string, string> = Object.fromEntries(
  NUTRIENTES.map((n) => [n.componenteTbca, n.campoPrisma]),
);

export interface ReferenciaNutriente {
  valor: number | null;
  unidade: string;
  tipo: TipoReferencia;
  /** texto curto explicando a origem do valor */
  nota?: string;
}

export type MapaReferencias = Record<string, ReferenciaNutriente>;

function faixaEtaria(idade: number): '19-50' | '51-70' | '71+' {
  if (idade >= 71) return '71+';
  if (idade >= 51) return '51-70';
  return '19-50';
}

/**
 * Referências diárias para o paciente.
 *
 * Valores de RDA/AI em: IOM DRI (tabela NIH/Harvard). Adulto 19-50 salvo nota.
 * Gestação/lactação: apenas os nutrientes com valor específico publicado são
 * ajustados; os demais mantêm o valor de adulto (aproximação conservadora).
 */
export function referenciasDri(ctx: ContextoDri): MapaReferencias {
  const { sexo, idadeAnos } = ctx;
  const idade = Number.isFinite(idadeAnos) ? idadeAnos : 30;
  const faixa = faixaEtaria(idade);
  const M = sexo === 'M';

  const g = ctx.gestante === true;
  const l = ctx.lactante === true;

  // Vitamina A: RDA adulto; gestação 770 / lactação 1300 (mcg RAE)
  const vitA = g ? 770 : l ? 1300 : M ? 900 : 700;
  // Vitamina C: 90 M / 75 F; gest 85 / lact 120
  const vitC = g ? 85 : l ? 120 : M ? 90 : 75;
  // Vitamina D: 15 mcg até 70, 20 a partir de 71
  const vitD = faixa === '71+' ? 20 : 15;
  // Vitamina E: 15 mg adulto; lactação 19
  const vitE = l ? 19 : 15;
  // Tiamina: 1.2 M / 1.1 F; gest/lact 1.4
  const tiamina = g || l ? 1.4 : M ? 1.2 : 1.1;
  // Riboflavina: 1.3 M / 1.1 F; gest 1.4 / lact 1.6
  const riboflavina = g ? 1.4 : l ? 1.6 : M ? 1.3 : 1.1;
  // Niacina: 16 M / 14 F; gest 18 / lact 17
  const niacina = g ? 18 : l ? 17 : M ? 16 : 14;
  // B6: 1.3 adulto até 50; 51+ 1.7 M / 1.5 F; gest 1.9 / lact 2.0
  const b6 = g ? 1.9 : l ? 2.0 : faixa === '19-50' ? 1.3 : M ? 1.7 : 1.5;
  // B12: 2.4; gest 2.6 / lact 2.8
  const b12 = g ? 2.6 : l ? 2.8 : 2.4;
  // Folato: 400; gest 600 / lact 500
  const folato = g ? 600 : l ? 500 : 400;
  // Cálcio: 1000 até 50; 51+ 1200 mulheres e 71+ homens
  const calcio =
    faixa === '71+' ? 1200 : faixa === '51-70' && !M ? 1200 : 1000;
  // Ferro: 8 M / 18 F (19-50); 51+ 8; gest 27 / lact 9
  const ferro = g ? 27 : l ? 9 : M ? 8 : faixa === '19-50' ? 18 : 8;
  // Magnésio: 400-420 M / 310-320 F
  const magnesio = M ? (faixa === '19-50' ? 400 : 420) : faixa === '19-50' ? 310 : 320;
  // Fósforo: 700
  const fosforo = 700;
  // Potássio (AI): 3400 M / 2600 F
  const potassio = M ? 3400 : 2600;
  // Zinco: 11 M / 8 F; gest 11 / lact 12
  const zinco = g ? 11 : l ? 12 : M ? 11 : 8;
  // Cobre: RDA 900 mcg = 0,9 mg (a TBCA entrega em mg)
  const cobre = l ? 1.3 : g ? 1.0 : 0.9;
  // Selênio: 55 mcg; gest 60 / lact 70
  const selenio = g ? 60 : l ? 70 : 55;

  return {
    calcio: { valor: calcio, unidade: 'mg', tipo: 'RDA' },
    ferro: {
      valor: ferro,
      unidade: 'mg',
      tipo: 'RDA',
      nota: g ? 'gestação' : l ? 'lactação' : !M && faixa === '19-50' ? 'mulher em idade fértil' : undefined,
    },
    magnesio: { valor: magnesio, unidade: 'mg', tipo: 'RDA' },
    fosforo: { valor: fosforo, unidade: 'mg', tipo: 'RDA' },
    potassio: { valor: potassio, unidade: 'mg', tipo: 'AI' },
    zinco: { valor: zinco, unidade: 'mg', tipo: 'RDA' },
    cobre: { valor: cobre, unidade: 'mg', tipo: 'RDA' },
    selenio: { valor: selenio, unidade: 'mcg', tipo: 'RDA' },

    vitaminaA: { valor: vitA, unidade: 'mcg', tipo: 'RDA', nota: 'RAE' },
    vitaminaC: { valor: vitC, unidade: 'mg', tipo: 'RDA' },
    vitaminaD: { valor: vitD, unidade: 'mcg', tipo: 'RDA' },
    vitaminaE: { valor: vitE, unidade: 'mg', tipo: 'RDA' },
    tiamina: { valor: tiamina, unidade: 'mg', tipo: 'RDA' },
    riboflavina: { valor: riboflavina, unidade: 'mg', tipo: 'RDA' },
    niacina: { valor: niacina, unidade: 'mg', tipo: 'RDA', nota: 'aprox. mg NE' },
    vitaminaB6: { valor: b6, unidade: 'mg', tipo: 'RDA' },
    vitaminaB12: { valor: b12, unidade: 'mcg', tipo: 'RDA' },
    folato: { valor: folato, unidade: 'mcg', tipo: 'RDA', nota: 'aprox. mcg DFE' },

    agSaturados: {
      valor: null,
      unidade: 'g',
      tipo: 'PERCENTUAL_ENERGIA',
      nota: 'até 10% das kcal',
    },
    agMonoinsaturados: { valor: null, unidade: 'g', tipo: 'SEM_REFERENCIA' },
    agPoliinsaturados: {
      valor: null,
      unidade: 'g',
      tipo: 'PERCENTUAL_ENERGIA',
      nota: '5-10% das kcal',
    },
    agTrans: {
      valor: null,
      unidade: 'g',
      tipo: 'PERCENTUAL_ENERGIA',
      nota: 'menos de 1% das kcal',
    },
    colesterol: {
      valor: 300,
      unidade: 'mg',
      tipo: 'LIMITE',
      nota: 'limite superior usual',
    },
  };
}

/** Alvo em gramas para gorduras quando a referência é % da energia. */
const PCT_ENERGIA: Record<string, number> = {
  agSaturados: 10,
  agPoliinsaturados: 10,
  agTrans: 1,
};

export interface ItemPlano {
  idAlimento: number;
  quantidadeGramas: number;
  aVontade?: boolean;
}

export interface AlimentoNutrientes {
  id: number;
  nome: string;
  nomeExibicao?: string | null;
  calorias: number | null;
  /** valores por 100 g */
  micros: Partial<Record<string, number | null>>;
}

export interface TotalNutriente {
  chave: string;
  rotulo: string;
  unidade: string;
  grupo: GrupoNutriente;
  prescrito: number;
  referencia: number | null;
  tipoReferencia: TipoReferencia;
  percentual: number | null;
  nota?: string;
  /** true quando o nutriente aparece sem dado em algum alimento relevante */
  incompleto?: boolean;
}

export interface ResultadoNutrientes {
  kcalTotal: number;
  totais: TotalNutriente[];
  cobertura: {
    itensTotais: number;
    itensSemAlimento: number;
    alimentosSemDados: string[];
  };
}

/**
 * Agrega os nutrientes de um plano alimentar e compara com a referência.
 *
 * `aVontade` não entra na soma (não há quantidade), igual ao resto do app.
 * Alimento sem valor do nutriente conta como 0 na soma, mas é sinalizado em
 * `incompleto` — é a diferença entre "o plano tem pouco ferro" e "não sabemos".
 */
export function agregarNutrientes(
  itens: ItemPlano[],
  alimentos: Map<number, AlimentoNutrientes>,
  ctx: ContextoDri,
): ResultadoNutrientes {
  const refs = referenciasDri(ctx);
  const soma = new Map<string, number>();
  const faltando = new Map<string, Set<string>>();
  const alimentosSemDados = new Set<string>();
  let kcalTotal = 0;
  let itensSemAlimento = 0;

  for (const item of itens) {
    if (item.aVontade) continue;
    const al = alimentos.get(item.idAlimento);
    if (!al) {
      itensSemAlimento += 1;
      continue;
    }
    const g = Number(item.quantidadeGramas) || 0;
    if (g <= 0) continue;
    const fator = g / 100;

    kcalTotal += (al.calorias ?? 0) * fator;

    // Um alimento sem NENHUM micronutriente (ex.: rótulo importado do OFF) não
    // deve marcar os 23 nutrientes como "incompletos": ele simplesmente não
    // contribui. Só é falta de dado o alimento que TEM micronutrientes, mas não
    // tem aquele nutriente específico.
    const chavesComDado = NUTRIENTES.filter((def) => {
      const bruto = al.micros[def.chave];
      return typeof bruto === 'number' && Number.isFinite(bruto);
    });

    if (chavesComDado.length === 0) {
      alimentosSemDados.add(al.nomeExibicao || al.nome);
      continue;
    }

    for (const def of chavesComDado) {
      const v = al.micros[def.chave] as number;
      soma.set(def.chave, (soma.get(def.chave) ?? 0) + v * fator);
    }

    // Marca só os nutrientes que este alimento teria obrigação de informar:
    // alimentos com dados parciais. Se ele informa 15 de 23, os 8 restantes
    // entram como falta de dado daquele nutriente.
    if (chavesComDado.length < NUTRIENTES.length) {
      for (const def of NUTRIENTES) {
        if (al.micros[def.chave] === undefined || al.micros[def.chave] === null) {
          if (!faltando.has(def.chave)) faltando.set(def.chave, new Set());
          faltando.get(def.chave)!.add(al.nomeExibicao || al.nome);
        }
      }
    }
  }

  const totais: TotalNutriente[] = NUTRIENTES.map((def) => {
    const prescrito = soma.get(def.chave) ?? 0;
    const ref = refs[def.chave] ?? { valor: null, unidade: def.unidade, tipo: 'SEM_REFERENCIA' as TipoReferencia };

    let referencia = ref.valor;
    // Gordura em % da energia: converte para gramas usando o total calórico.
    const pct = PCT_ENERGIA[def.chave];
    if (referencia === null && pct != null && kcalTotal > 0) {
      referencia = (kcalTotal * (pct / 100)) / 9;
    }

    const percentual =
      referencia && referencia > 0 ? (prescrito / referencia) * 100 : null;

    return {
      chave: def.chave,
      rotulo: def.rotulo,
      unidade: def.unidade,
      grupo: def.grupo,
      prescrito: arredondar(prescrito, def.unidade),
      referencia: referencia != null ? arredondar(referencia, def.unidade) : null,
      tipoReferencia: ref.tipo,
      percentual: percentual != null ? Math.round(percentual) : null,
      nota: ref.nota,
      incompleto: (faltando.get(def.chave)?.size ?? 0) > 0 || undefined,
    };
  });

  return {
    kcalTotal: Math.round(kcalTotal),
    totais,
    cobertura: {
      itensTotais: itens.length,
      itensSemAlimento,
      alimentosSemDados: [...alimentosSemDados],
    },
  };
}

/** Arredonda conforme a grandeza: mcg e mg com 1 decimal, g com 1 decimal. */
function arredondar(v: number, unidade: string): number {
  if (unidade === 'mcg') return Math.round(v * 10) / 10;
  if (unidade === 'mg') return Math.round(v * 10) / 10;
  return Math.round(v * 10) / 10;
}
