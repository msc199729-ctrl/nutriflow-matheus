/**
 * Cálculos de avaliação física (IMC, RCQ, TMB Mifflin-St Jeor).
 * Classificações conforme referências OMS e risco metabólico RCQ.
 */

export function calcularImc(pesoKg: number, alturaM: number): number {
  if (alturaM <= 0) return 0;
  return Math.round((pesoKg / (alturaM * alturaM)) * 10) / 10;
}

export function classificarImc(imc: number): string {
  if (imc < 18.5) return 'Baixo peso';
  if (imc < 25) return 'Eutrofia';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidade grau I';
  if (imc < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
}

export function calcularRcq(circCinturaCm: number, circQuadrilCm: number): number {
  if (circQuadrilCm <= 0) return 0;
  return Math.round((circCinturaCm / circQuadrilCm) * 100) / 100;
}

/**
 * Risco metabólico por RCQ (adultos). Valores de referência simplificados.
 * Homens: elevado >= 0,95; Mulheres: elevado >= 0,80
 */
export function riscoMetabolicoRcq(
  rcq: number,
  genero: string | null | undefined,
): string {
  const generoLower = genero?.toLowerCase() ?? '';
  const isMulher =
    generoLower === 'f' ||
    generoLower === 'feminino' ||
    generoLower === 'female';
  const limiteElevado = isMulher ? 0.8 : 0.95;
  const limiteMuitoElevado = isMulher ? 0.85 : 1.0;
  if (rcq < limiteElevado) return 'Baixo';
  if (rcq < limiteMuitoElevado) return 'Elevado';
  return 'Muito elevado';
}

/**
 * TMB (Taxa Metabólica Basal) pela fórmula de Mifflin-St Jeor.
 * Peso em kg, altura em cm, idade em anos.
 * Homens: (10 × peso) + (6,25 × altura) - (5 × idade) + 5
 * Mulheres: (10 × peso) + (6,25 × altura) - (5 × idade) - 161
 */
export function calcularTmbMifflinStJeor(
  pesoKg: number,
  alturaCm: number,
  idadeAnos: number,
  genero: string | null | undefined,
): number {
  const base = 10 * pesoKg + 6.25 * alturaCm - 5 * idadeAnos;
  const generoLower = genero?.toLowerCase() ?? '';
  const isMulher =
    generoLower === 'f' ||
    generoLower === 'feminino' ||
    generoLower === 'female';
  const tmb = isMulher ? base - 161 : base + 5;
  return Math.round(Math.max(0, tmb));
}

export function idadeEmAnos(dataNascimento: Date | null | undefined): number | null {
  if (!dataNascimento) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - dataNascimento.getFullYear();
  const m = hoje.getMonth() - dataNascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < dataNascimento.getDate())) anos--;
  return anos;
}

// ---------------------------------------------------------------------------
// Fórmulas de percentual de gordura corporal por dobras cutâneas
// ---------------------------------------------------------------------------

function isFeminino(genero: string | null | undefined): boolean {
  const g = genero?.toLowerCase() ?? '';
  return g === 'f' || g === 'feminino' || g === 'female';
}

/** Siri (1961): converte densidade corporal em % gordura */
function siri(dc: number): number {
  if (dc <= 0) return 0;
  return (4.95 / dc - 4.5) * 100;
}

export interface ResultadoGordura {
  percentualGordura: number;
  somatorioDobrasMm: number;
  densidadeCorporal: number;
}

/** Jackson & Pollock 3 dobras (1978/1980) */
export function calcularGorduraPollock3(
  dobras: { tricipital?: number; abdominal?: number; suprailiaca?: number; toracica?: number; coxa?: number },
  idadeAnos: number,
  genero: string | null | undefined,
): ResultadoGordura | null {
  const fem = isFeminino(genero);
  if (fem) {
    const t = dobras.tricipital; const si = dobras.suprailiaca; const cx = dobras.coxa;
    if (t == null || si == null || cx == null) return null;
    const s = t + si + cx;
    const dc = 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * idadeAnos;
    return { percentualGordura: round1(siri(dc)), somatorioDobrasMm: round1(s), densidadeCorporal: round4(dc) };
  }
  const tx = dobras.toracica; const ab = dobras.abdominal; const cx = dobras.coxa;
  if (tx == null || ab == null || cx == null) return null;
  const s = tx + ab + cx;
  const dc = 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * idadeAnos;
  return { percentualGordura: round1(siri(dc)), somatorioDobrasMm: round1(s), densidadeCorporal: round4(dc) };
}

/** Jackson & Pollock 7 dobras (1978/1980) */
export function calcularGorduraPollock7(
  dobras: { tricipital?: number; subescapular?: number; axilarMedia?: number; toracica?: number; abdominal?: number; suprailiaca?: number; coxa?: number },
  idadeAnos: number,
  genero: string | null | undefined,
): ResultadoGordura | null {
  const { tricipital: t, subescapular: se, axilarMedia: ax, toracica: tx, abdominal: ab, suprailiaca: si, coxa: cx } = dobras;
  if (t == null || se == null || ax == null || tx == null || ab == null || si == null || cx == null) return null;
  const s = t + se + ax + tx + ab + si + cx;
  const fem = isFeminino(genero);
  const dc = fem
    ? 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * idadeAnos
    : 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * idadeAnos;
  return { percentualGordura: round1(siri(dc)), somatorioDobrasMm: round1(s), densidadeCorporal: round4(dc) };
}

/** Petroski (1995) — 4 dobras (homens: SE+TR+SI+PM; mulheres: AX+SI+CX+PM) */
export function calcularGorduraPetroski(
  dobras: { tricipital?: number; subescapular?: number; axilarMedia?: number; suprailiaca?: number; coxa?: number; panturrilha?: number },
  idadeAnos: number,
  genero: string | null | undefined,
): ResultadoGordura | null {
  const fem = isFeminino(genero);
  if (fem) {
    const { axilarMedia: ax, suprailiaca: si, coxa: cx, panturrilha: pm } = dobras;
    if (ax == null || si == null || cx == null || pm == null) return null;
    const s = ax + si + cx + pm;
    const dc = 1.02902361 - 0.00067159 * s + 0.00000242 * s * s - 0.0002073 * idadeAnos;
    return { percentualGordura: round1(siri(dc)), somatorioDobrasMm: round1(s), densidadeCorporal: round4(dc) };
  }
  const { subescapular: se, tricipital: t, suprailiaca: si, panturrilha: pm } = dobras;
  if (se == null || t == null || si == null || pm == null) return null;
  const s = se + t + si + pm;
  const dc = 1.10726863 - 0.00081201 * s + 0.00000212 * s * s - 0.00041761 * idadeAnos;
  return { percentualGordura: round1(siri(dc)), somatorioDobrasMm: round1(s), densidadeCorporal: round4(dc) };
}

/** Guedes (1985) — 3 dobras (H: TR+SI+AB; M: SI+CX+SE) */
export function calcularGorduraGuedes(
  dobras: { tricipital?: number; subescapular?: number; abdominal?: number; suprailiaca?: number; coxa?: number },
  idadeAnos: number,
  genero: string | null | undefined,
): ResultadoGordura | null {
  const fem = isFeminino(genero);
  if (fem) {
    const { suprailiaca: si, coxa: cx, subescapular: se } = dobras;
    if (si == null || cx == null || se == null) return null;
    const s = si + cx + se;
    const dc = 1.16650 - 0.07063 * Math.log10(s);
    return { percentualGordura: round1(siri(dc)), somatorioDobrasMm: round1(s), densidadeCorporal: round4(dc) };
  }
  const { tricipital: t, suprailiaca: si, abdominal: ab } = dobras;
  if (t == null || si == null || ab == null) return null;
  const s = t + si + ab;
  const dc = 1.17136 - 0.06706 * Math.log10(s);
  return { percentualGordura: round1(siri(dc)), somatorioDobrasMm: round1(s), densidadeCorporal: round4(dc) };
}

/** Durnin & Womersley (1974) — 4 dobras (TR+BI+SE+SI) */
export function calcularGorduraDurninWomersley(
  dobras: { tricipital?: number; bicipital?: number; subescapular?: number; suprailiaca?: number },
  idadeAnos: number,
  genero: string | null | undefined,
): ResultadoGordura | null {
  const { tricipital: t, bicipital: bi, subescapular: se, suprailiaca: si } = dobras;
  if (t == null || bi == null || se == null || si == null) return null;
  const s = t + bi + se + si;
  const logS = Math.log10(s);
  const fem = isFeminino(genero);
  let dc: number;
  if (fem) {
    if (idadeAnos < 20) dc = 1.1549 - 0.0678 * logS;
    else if (idadeAnos < 30) dc = 1.1599 - 0.0717 * logS;
    else if (idadeAnos < 40) dc = 1.1423 - 0.0632 * logS;
    else if (idadeAnos < 50) dc = 1.1333 - 0.0612 * logS;
    else dc = 1.1339 - 0.0645 * logS;
  } else {
    if (idadeAnos < 20) dc = 1.1620 - 0.0630 * logS;
    else if (idadeAnos < 30) dc = 1.1631 - 0.0632 * logS;
    else if (idadeAnos < 40) dc = 1.1422 - 0.0544 * logS;
    else if (idadeAnos < 50) dc = 1.1620 - 0.0700 * logS;
    else dc = 1.1715 - 0.0779 * logS;
  }
  return { percentualGordura: round1(siri(dc)), somatorioDobrasMm: round1(s), densidadeCorporal: round4(dc) };
}

/** Faulkner (1968) — 4 dobras (TR+SE+SI+AB) */
export function calcularGorduraFaulkner(
  dobras: { tricipital?: number; subescapular?: number; suprailiaca?: number; abdominal?: number },
): ResultadoGordura | null {
  const { tricipital: t, subescapular: se, suprailiaca: si, abdominal: ab } = dobras;
  if (t == null || se == null || si == null || ab == null) return null;
  const s = t + se + si + ab;
  const pct = s * 0.153 + 5.783;
  return { percentualGordura: round1(pct), somatorioDobrasMm: round1(s), densidadeCorporal: 0 };
}

export type ProtocoloGordura =
  | 'Pollock 3 dobras'
  | 'Pollock 7 dobras'
  | 'Petroski'
  | 'Guedes'
  | 'Durnin-Womersley'
  | 'Faulkner'
  | 'Jackson-Pollock';

export interface DobrasInput {
  tricipital?: number;
  bicipital?: number;
  subescapular?: number;
  axilarMedia?: number;
  toracica?: number;
  abdominal?: number;
  suprailiaca?: number;
  supraEspinhal?: number;
  coxa?: number;
  panturrilha?: number;
}

export function calcularGorduraPorProtocolo(
  protocolo: string,
  dobras: DobrasInput,
  idadeAnos: number,
  genero: string | null | undefined,
): ResultadoGordura | null {
  const p = protocolo.trim().toLowerCase();
  if (p.includes('pollock') && p.includes('3')) return calcularGorduraPollock3(dobras, idadeAnos, genero);
  if (p.includes('pollock') && p.includes('7')) return calcularGorduraPollock7(dobras, idadeAnos, genero);
  if (p.includes('jackson')) return calcularGorduraPollock7(dobras, idadeAnos, genero);
  if (p.includes('petroski')) return calcularGorduraPetroski(dobras, idadeAnos, genero);
  if (p.includes('guedes')) return calcularGorduraGuedes(dobras, idadeAnos, genero);
  if (p.includes('durnin')) return calcularGorduraDurninWomersley(dobras, idadeAnos, genero);
  if (p.includes('faulkner')) return calcularGorduraFaulkner(dobras);
  return null;
}

function round1(v: number): number { return Math.round(v * 10) / 10; }
function round4(v: number): number { return Math.round(v * 10000) / 10000; }
