export type Sexo = 'M' | 'F';

export type FormulaId =
  | 'HARRIS_1919'
  | 'HARRIS_1984'
  | 'FAO_WHO_2004'
  | 'EER_IOM_2005'
  | 'EER_2023'
  | 'KATCH_MCARDLE'
  | 'CUNNINGHAM'
  | 'MIFFLIN'
  | 'MIFFLIN_MLG'
  | 'HENRY_REES'
  | 'TINSLEY_PESO'
  | 'TINSLEY_MLG'
  | 'GET_BOLSO'
  | 'TMB_MANUAL'
  | 'GET_MANUAL';

export type NivelEer = 'SEDENTARIO' | 'BAIXO' | 'ATIVO' | 'MUITO_ATIVO';

export interface EntradaCalculo {
  pesoKg: number;
  alturaCm: number;
  idadeAnos: number;
  sexo: Sexo;
  massaMagraKg?: number | null;
  fatorAtividade: number;
  fatorInjuria?: number;
  eerNivel?: NivelEer;
  adicionalMet?: number | null;
  adicionalVenta?: number | null;
  adicionalGestante?: number | null;
  tmbManual?: number | null;
  getManual?: number | null;
}

export interface ResultadoCalculo {
  formula: FormulaId;
  tmb: number;
  get: number;
  /** true quando a fórmula devolve GET direto, sem TMB vezes fator. */
  getDireto: boolean;
  /** true quando o fator de atividade deve ser ignorado na UI. */
  ignoraFatorAtividade: boolean;
  avisos: string[];
}

function exigirMlg(e: EntradaCalculo, nome: string): number {
  if (!e.massaMagraKg || e.massaMagraKg <= 0) {
    throw new Error(`${nome} exige a massa livre de gordura. Informe a MLG.`);
  }
  return e.massaMagraKg;
}

function faixa(idade: number): '18-30' | '30-60' | '60-70' | '70+' {
  if (idade < 30) return '18-30';
  if (idade < 60) return '30-60';
  if (idade <= 70) return '60-70';
  return '70+';
}

/** TMB em kcal/dia. Não aplica fator de atividade nem injúria. */
function tmbBruta(id: FormulaId, e: EntradaCalculo, avisos: string[]): number {
  const { pesoKg: p, alturaCm: a, idadeAnos: i, sexo } = e;
  const m = sexo === 'M';

  switch (id) {
    case 'HARRIS_1919':
      return m
        ? 66.473 + 13.7516 * p + 5.0033 * a - 6.755 * i
        : 655.0955 + 9.5634 * p + 1.8496 * a - 4.6756 * i;

    case 'HARRIS_1984':
      return m
        ? 88.362 + 13.397 * p + 4.799 * a - 5.677 * i
        : 447.593 + 3.098 * p + 4.33 * a - 4.33 * i;

    case 'MIFFLIN':
      return 10 * p + 6.25 * a - 5 * i + (m ? 5 : -161);

    case 'MIFFLIN_MLG': {
      const mlg = exigirMlg(e, 'Mifflin adaptada por MLG');
      avisos.push(
        'Mifflin por MLG é adaptação da equação de 1990, não uma equação publicada. '
        + 'Para MLG com validação, prefira Katch-McArdle, Cunningham ou Tinsley por MLG.',
      );
      return 10 * mlg + 6.25 * a - 5 * i + (m ? 5 : -161);
    }

    case 'KATCH_MCARDLE':
      return 370 + 21.6 * exigirMlg(e, 'Katch-McArdle');

    case 'CUNNINGHAM':
      return 500 + 22 * exigirMlg(e, 'Cunningham');

    case 'TINSLEY_PESO':
      return 25.9 * p + 284;

    case 'TINSLEY_MLG':
      return 25.9 * exigirMlg(e, 'Tinsley por MLG') + 284;

    case 'FAO_WHO_2004': {
      const f = faixa(i);
      if (m) {
        if (f === '18-30') return 15.3 * p + 679;
        if (f === '30-60') return 11.6 * p + 879;
        return 13.5 * p + 487;
      }
      if (f === '18-30') return 14.7 * p + 496;
      if (f === '30-60') return 8.7 * p + 829;
      return 10.5 * p + 596;
    }

    case 'HENRY_REES': {
      const f = faixa(i);
      if (m) {
        if (f === '18-30') return 15.057 * p + 692.2;
        if (f === '30-60') return 11.472 * p + 873.1;
        return 11.711 * p + 587.7;
      }
      if (f === '18-30') return 14.818 * p + 486.6;
      if (f === '30-60') return 8.126 * p + 845.6;
      return 9.082 * p + 658.5;
    }

    default:
      throw new Error(`Fórmula sem TMB: ${id}`);
  }
}

/** EER/IOM 2005. Devolve TEE direto. Coeficientes de atividade embutidos. */
function eer2005(e: EntradaCalculo): number {
  const alturaM = e.alturaCm / 100;
  const n = e.eerNivel ?? 'BAIXO';

  const coef = (() => {
    if (e.sexo === 'M') {
      return n === 'SEDENTARIO' ? 1.0 : n === 'BAIXO' ? 1.11 : n === 'ATIVO' ? 1.25 : 1.48;
    }
    return n === 'SEDENTARIO' ? 1.0 : n === 'BAIXO' ? 1.12 : n === 'ATIVO' ? 1.27 : 1.45;
  })();

  return e.sexo === 'M'
    ? 662 - 9.53 * e.idadeAnos + coef * (15.91 * e.pesoKg + 539.6 * alturaM)
    : 354 - 6.91 * e.idadeAnos + coef * (9.36 * e.pesoKg + 726 * alturaM);
}

/**
 * EER 2023 (DRIs for Energy, National Academies, 2023), adultos 19+.
 * Altura em cm, peso em kg, idade em anos. Devolve TEE em kcal/dia.
 * Fonte: NIH Bookshelf, Table S-3.
 */
function eer2023(e: EntradaCalculo): number {
  const i = e.idadeAnos;
  const a = e.alturaCm;
  const p = e.pesoKg;
  const n = e.eerNivel ?? 'BAIXO';

  if (e.sexo === 'M') {
    switch (n) {
      case 'SEDENTARIO':
        return 753.07 - 10.83 * i + 6.5 * a + 14.1 * p;
      case 'BAIXO':
        return 581.47 - 10.83 * i + 8.3 * a + 14.94 * p;
      case 'ATIVO':
        return 1004.82 - 10.83 * i + 6.52 * a + 15.91 * p;
      default:
        return -517.88 - 10.83 * i + 15.61 * a + 19.11 * p;
    }
  }

  switch (n) {
    case 'SEDENTARIO':
      return 584.9 - 7.01 * i + 5.72 * a + 11.71 * p;
    case 'BAIXO':
      return 575.77 - 7.01 * i + 6.6 * a + 12.14 * p;
    case 'ATIVO':
      return 710.25 - 7.01 * i + 6.54 * a + 12.34 * p;
    default:
      return 511.83 - 7.01 * i + 9.07 * a + 12.56 * p;
  }
}

export function calcular(id: FormulaId, e: EntradaCalculo): ResultadoCalculo {
  const avisos: string[] = [];
  const fat = e.fatorAtividade > 0 ? e.fatorAtividade : 1;
  const inj = e.fatorInjuria && e.fatorInjuria > 0 ? e.fatorInjuria : 1;
  const extra =
    (e.adicionalMet ?? 0) + (e.adicionalVenta ?? 0) + (e.adicionalGestante ?? 0);

  if (id === 'TMB_MANUAL') {
    if (!e.tmbManual || e.tmbManual <= 0) throw new Error('Informe a TMB manual.');
    return {
      formula: id,
      tmb: Math.round(e.tmbManual),
      get: Math.round(e.tmbManual * fat * inj + extra),
      getDireto: false,
      ignoraFatorAtividade: false,
      avisos,
    };
  }

  if (id === 'GET_MANUAL') {
    if (!e.getManual || e.getManual <= 0) throw new Error('Informe o GET manual.');
    return {
      formula: id,
      tmb: 0,
      get: Math.round(e.getManual),
      getDireto: true,
      ignoraFatorAtividade: true,
      avisos,
    };
  }

  if (id === 'EER_IOM_2005' || id === 'EER_2023') {
    const tee = id === 'EER_2023' ? eer2023(e) : eer2005(e);
    avisos.push(
      'EER já estima o gasto total. Fator de atividade e fator injúria não se aplicam.',
    );
    return {
      formula: id,
      tmb: 0,
      get: Math.round(tee + extra),
      getDireto: true,
      ignoraFatorAtividade: true,
      avisos,
    };
  }

  if (id === 'GET_BOLSO') {
    const tmb = 25 * e.pesoKg;
    avisos.push('Fórmula de bolso estima TMB em 25 kcal por kg.');
    return {
      formula: id,
      tmb: Math.round(tmb),
      get: Math.round(tmb * fat * inj + extra),
      getDireto: false,
      ignoraFatorAtividade: false,
      avisos,
    };
  }

  const tmb = tmbBruta(id, e, avisos);
  return {
    formula: id,
    tmb: Math.round(tmb),
    get: Math.round(tmb * fat * inj + extra),
    getDireto: false,
    ignoraFatorAtividade: false,
    avisos,
  };
}

export const FORMULAS_ADULTO: { id: FormulaId; rotulo: string }[] = [
  { id: 'HARRIS_1919', rotulo: 'Harris-Benedict (1919)' },
  { id: 'HARRIS_1984', rotulo: 'Harris-Benedict (1984)' },
  { id: 'FAO_WHO_2004', rotulo: 'FAO/WHO (2004)' },
  { id: 'EER_IOM_2005', rotulo: 'EER/IOM (2005)' },
  { id: 'EER_2023', rotulo: 'EER (2023)' },
  { id: 'KATCH_MCARDLE', rotulo: 'Katch-McArdle (1996)' },
  { id: 'CUNNINGHAM', rotulo: 'Cunningham (1980)' },
  { id: 'MIFFLIN', rotulo: 'Mifflin-St Jeor (1990)' },
  { id: 'MIFFLIN_MLG', rotulo: 'Mifflin adaptada por MLG' },
  { id: 'HENRY_REES', rotulo: 'Henry e Rees (1991)' },
  { id: 'TINSLEY_PESO', rotulo: 'Tinsley por peso (2018)' },
  { id: 'TINSLEY_MLG', rotulo: 'Tinsley por MLG (2018)' },
  { id: 'GET_BOLSO', rotulo: 'GET por fórmula de bolso' },
  { id: 'TMB_MANUAL', rotulo: 'TMB manual' },
  { id: 'GET_MANUAL', rotulo: 'GET manual' },
];

export const FATORES_ATIVIDADE = [
  { valor: 1.2, rotulo: '1.200 - Sedentário' },
  { valor: 1.375, rotulo: '1.375 - Levemente ativo' },
  { valor: 1.55, rotulo: '1.550 - Moderado' },
  { valor: 1.725, rotulo: '1.725 - Muito ativo' },
  { valor: 1.9, rotulo: '1.900 - Atleta' },
];

export const FATORES_INJURIA = [
  { valor: 1.0, rotulo: '1.00 - Sem injúria' },
  { valor: 1.1, rotulo: '1.10 - Leve' },
  { valor: 1.2, rotulo: '1.20 - Moderada' },
  { valor: 1.3, rotulo: '1.30 - Grave' },
  { valor: 1.5, rotulo: '1.50 - Queimado' },
];

export const NIVEIS_EER: { valor: NivelEer; rotulo: string }[] = [
  { valor: 'SEDENTARIO', rotulo: 'Inativo' },
  { valor: 'BAIXO', rotulo: 'Pouco ativo' },
  { valor: 'ATIVO', rotulo: 'Ativo' },
  { valor: 'MUITO_ATIVO', rotulo: 'Muito ativo' },
];

/** Fórmulas que exigem MLG para calcular. */
export const EXIGEM_MLG: FormulaId[] = [
  'KATCH_MCARDLE',
  'CUNNINGHAM',
  'MIFFLIN_MLG',
  'TINSLEY_MLG',
];