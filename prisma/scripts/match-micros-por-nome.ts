/**
 * Casamento por NOME: preenche micronutrientes de alimentos canônicos
 * (criados fora da TBCA, sem codigoTbca) usando linhas da TBCA por
 * semelhança de nome.
 *
 * Uso (na raiz do backend):
 *   npx tsx prisma/scripts/match-micros-por-nome.ts            # relatório (nada grava)
 *   npx tsx prisma/scripts/match-micros-por-nome.ts --aplicar  # grava de verdade
 *
 * DUAS CAMADAS DE DECISÃO:
 *
 * 1. MAPA MANUAL (constante MANUAL) — para os ~40 canônicos conhecidos. Cada
 *    entrada diz os tokens obrigatórios, o que EVITAR e o que PREFERIR na
 *    descrição TBCA. Existe porque o relatório automático (v2) propôs erros
 *    que só revisão humana pega: "Leite de vaca desnatado" casou com
 *    "desnatado EM PÓ" (score 0,85) em vez do fluído — leite em pó tem ~4x
 *    os nutrientes/100 g.
 *
 * 2. REGRA GENÉRICA — para qualquer alimento fora do mapa: similaridade
 *    (Jaccard + cobertura) com margem sobre o 2º colocado.
 *
 * SALVAGUARDAS (por que é seguro):
 *   1. Só toca em alimento com TODOS os 23 micros nulos (não sobrescreve nada).
 *   2. Manual: tokens obrigatórios + lista de exclusão + ranking por preferência;
 *      empate real no topo NÃO casa (vai para revisão).
 *   3. Genérico: alimento COM classeTbca só casa na própria classe; SEM classe
 *      usa pool global com threshold 0.60 + margem sobre o 2º.
 *   4. Validações do importador (teto de sanidade, soma de ácidos graxos)
 *      são aplicadas antes de gravar.
 *   5. Atribui codigoTbca? NÃO — o campo é @unique e o alimento canônico não
 *      é uma linha TBCA. Deixa null; a rastreabilidade fica no relatório.
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7 exige opções explícitas (driver adapter). Mesma construção do
 * src/prisma/prisma.service.ts do projeto — fonte única da URL do banco.
 */
function getDatasourceUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const user = process.env.DB_USER ?? 'postgres';
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const name = process.env.DB_NAME ?? 'nutriflow';
  return `postgresql://${user}:${password}@${host}:${port}/${name}?schema=public`;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: getDatasourceUrl() }) });

/** Os 23 campos de micro (mesmos nomes do schema). */
const MICRO = [
  'calcio', 'ferro', 'magnesio', 'fosforo', 'potassio', 'zinco', 'cobre', 'selenio',
  'vitaminaARae', 'vitaminaC', 'vitaminaD', 'vitaminaE', 'tiamina',
  'vitaminaB2', 'vitaminaB3', 'vitaminaB6', 'vitaminaB12', 'folato',
  'gorduraSaturada', 'gorduraMonoinsaturada', 'gorduraPoliinsaturada', 'gorduraTrans',
  'colesterol',
] as const;

/** Teto de sanidade (por 100 g) — igual ao importador. */
const LIMITES: Record<string, number> = {
  calcio: 5000, ferro: 100, magnesio: 1200, fosforo: 3000, potassio: 25000,
  zinco: 100, cobre: 30, selenio: 3000, vitaminaARae: 100000, vitaminaC: 5000,
  vitaminaD: 1000, vitaminaE: 500, tiamina: 50, vitaminaB2: 50, vitaminaB3: 100,
  vitaminaB6: 20, vitaminaB12: 200, folato: 5000, gorduraSaturada: 100,
  gorduraMonoinsaturada: 100, gorduraPoliinsaturada: 100, gorduraTrans: 50,
  colesterol: 5000,
};

const CAMPOS_ACIDOS = ['gorduraSaturada', 'gorduraMonoinsaturada', 'gorduraPoliinsaturada', 'gorduraTrans'];

/** Componente TBCA -> campo. Igual ao importador. */
const MAPA: Record<string, string> = {
  'Cálcio': 'calcio',
  'Ferro': 'ferro',
  'Magnésio': 'magnesio',
  'Fósforo': 'fosforo',
  'Potássio': 'potassio',
  'Zinco': 'zinco',
  'Cobre': 'cobre',
  'Selênio': 'selenio',
  'Vitamina A (RAE)': 'vitaminaARae',
  'Vitamina C': 'vitaminaC',
  'Vitamina D': 'vitaminaD',
  'Alfa-tocoferol (Vitamina E)': 'vitaminaE',
  'Tiamina': 'tiamina',
  'Riboflavina': 'vitaminaB2',
  'Niacina': 'vitaminaB3',
  'Vitamina B6': 'vitaminaB6',
  'Vitamina B12': 'vitaminaB12',
  'Equivalente de folato': 'folato',
  'Ácidos graxos saturados': 'gorduraSaturada',
  'Ácidos graxos monoinsaturados': 'gorduraMonoinsaturada',
  'Ácidos graxos poliinsaturados': 'gorduraPoliinsaturada',
  'Ácidos graxos trans': 'gorduraTrans',
  'Colesterol': 'colesterol',
};

type Linha = {
  codigo: string;
  classe: string;
  descricao: string;
  nutrientes: Array<{ Componente: string; Unidades: string; 'Valor por 100g': string }>;
};

// ── Normalização e similaridade ──────────────────────────────────────

/** Stopwords de descrição de alimento (PT-BR). */
const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'em', 'e', 'a', 'o', 'sem']);

/** Radical aproximado: grelhado/grelhada -> grelhad, feijões -> feijo. */
function radical(t: string): string {
  if (t.length > 5 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 4 && (t.endsWith('os') || t.endsWith('as'))) return t.slice(0, -2);
  if (t.length > 4 && (t.endsWith('o') || t.endsWith('a'))) return t.slice(0, -1);
  return t;
}

/** Remove acentos, minúsculas, tira ruído/stopwords e aplica radical leve. */
function normalizar(s: string): string[] {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .filter((t) => !STOPWORDS.has(t))
    .map(radical);
}

/** Só tira acento e minúscula — para checar substring na descrição crua. */
function tiraAcento(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Similaridade entre nomes de alimento: 60% Jaccard de tokens + 40% cobertura
 * (fração dos tokens do MENOR nome presentes no maior).
 */
function similaridade(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const jaccard = inter / (sa.size + sb.size - inter);
  const menor = a.length <= b.length ? sa : sb;
  const maior = a.length <= b.length ? sb : sa;
  let cobertos = 0;
  for (const t of menor) if (maior.has(t)) cobertos += 1;
  const cobertura = menor.size ? cobertos / menor.size : 0;
  return 0.6 * jaccard + 0.4 * cobertura;
}

// ── MAPA MANUAL (revisão humana sobre o relatório automático) ────────
//
// Chave = nome canônico como está no banco (a chave é normalizada antes de
// casar). tokens = TODOS devem existir na descrição TBCA. evitar = substring
// que INVALIDA a linha. preferir = substring que SOBE a linha no ranking.
//
// Convenção: quando o nome canônico não especifica sal/óleo, preferir a
// variante "s/ sal" e "s/ óleo" da TBCA (preparação padrão, sem tempero).

const MANUAL: Record<string, { tokens: string[]; evitar?: string[]; preferir?: string[] }> = {
  'Frango peito grelhado sem pele': { tokens: ['frango', 'peito', 'grelhado'], evitar: ['coxa', 'sobrecoxa', 'asa', 'gema', 'fígado'], preferir: ['s/ pele', 's/ sal'] },
  'Frango peito cozido sem pele': { tokens: ['frango', 'peito', 'cozido'], evitar: ['coxa', 'sobrecoxa', 'asa', 'gema'], preferir: ['s/ pele', 's/ sal'] },
  'Frango coxa cozida sem pele': { tokens: ['frango', 'coxa', 'cozido'], evitar: ['sobrecoxa'], preferir: ['s/ pele', 's/ sal'] },
  'Frango sobrecoxa assada sem pele': { tokens: ['frango', 'sobrecoxa', 'assado'], evitar: ['c/ pele'], preferir: ['s/ pele', 's/ sal'] },
  'Ovo de galinha cozido': { tokens: ['ovo', 'galinha', 'cozido'], evitar: ['gema', 'clara', 'frito', 'mexido', 'omelete'], preferir: ['inteiro', 's/ sal'] },
  'Ovo de galinha frito': { tokens: ['ovo', 'galinha', 'frito'], evitar: ['gema', 'clara', 'cozido', 'mexido'], preferir: ['inteiro', 's/ sal'] },
  'Carne bovina patinho grelhado sem gordura': { tokens: ['patinho', 'grelhado'], evitar: ['porco', 'suín', 'frango'], preferir: ['s/ gordura', 's/ sal'] },
  'Carne bovina acém cozido sem gordura': { tokens: ['acém', 'cozido'], evitar: ['porco', 'suín', 'frango'], preferir: ['s/ gordura', 's/ sal'] },
  'Carne suína lombo assado': { tokens: ['lombo', 'assado'], evitar: ['bovina', 'boi', 'frango'], preferir: ['suín', 'porco', 's/ sal'] },
  'Peixe tilápia grelhada': { tokens: ['tilápia', 'grelhado'], preferir: ['s/ óleo', 's/ sal'] },
  'Peixe salmão grelhado': { tokens: ['salmão', 'grelhado'], preferir: ['s/ óleo', 's/ sal'] },
  'Atum em água drenado': { tokens: ['atum', 'conserva'], evitar: ['óleo'], preferir: ['água', 'escorrido', 'light'] },
  'Arroz branco cozido': { tokens: ['arroz', 'cozido'], evitar: ['integral', 'doce', 'feijão', 'frito', 'carne'], preferir: ['polido', 'branco', 's/ sal', 's/ óleo'] },
  'Arroz integral cozido': { tokens: ['arroz', 'integral', 'cozido'], evitar: ['doce', 'leite', 'condensado', 'feijão'], preferir: ['s/ sal', 's/ óleo'] },
  'Feijão carioca cozido': { tokens: ['feijão', 'carioca', 'cozido'], evitar: ['arroz'], preferir: ['s/ óleo', 's/ sal'] },
  'Feijão preto cozido': { tokens: ['feijão', 'preto', 'cozido'], evitar: ['arroz'], preferir: ['s/ óleo', 's/ sal'] },
  'Lentilha cozida': { tokens: ['lentilha', 'cozido'], preferir: ['s/ óleo', 's/ sal'] },
  'Mandioca cozida': { tokens: ['mandioca', 'cozido'], preferir: ['drenada', 's/ óleo', 's/ sal'] },
  'Mamão papaia': { tokens: ['mamão'], evitar: ['suco', 'vitamina', 'doce', 'geleia', 'creme'], preferir: ['in natura', 'papaia'] },
  'Iogurte natural integral': { tokens: ['iogurte', 'natural'], evitar: ['morango', 'aveia', 'mel', 'desnatado', 'light', 'grego'], preferir: ['integral', 'média'] },
  'Azeite de oliva extra virgem': { tokens: ['azeite', 'oliva'], preferir: ['extra virgem', 'extravirgem'] },
  'Castanha do Pará': { tokens: ['castanha'], evitar: ['caju', 'doce', 'bolo', 'sobremesa', 'caramelizada', 'mix', 'cobert', 'chocolate'], preferir: ['pará', 'brasil', 'crua'] },
  'Leite de vaca desnatado': { tokens: ['leite', 'vaca', 'desnatado'], evitar: ['em pó', 'chocolate', 'achocolatado', 'condensado', 'fermentado', 'iogurte', 'cabra'], preferir: ['fluído', 'fluido'] },
  'Leite de vaca integral': { tokens: ['leite', 'vaca', 'integral'], evitar: ['em pó', 'chocolate', 'condensado', 'fermentado', 'iogurte', 'arroz', 'doce', 'canela', 'vitamina', 'cabra'], preferir: ['fluído', 'fluido'] },
  'Óleo de soja': { tokens: ['óleo', 'soja'], evitar: ['salada', 'margarina', 'maionese'], preferir: ['glycine'] },
  'Amêndoa': { tokens: ['amêndoa'], evitar: ['torrone', 'caramelizada', 'doce', 'torta', 'bolo', 'chocolate'], preferir: ['crua', 'in natura'] },
  'Brócolis cozido': { tokens: ['brócolis', 'cozido'], preferir: ['s/ óleo', 's/ sal'] },
  'Cenoura crua': { tokens: ['cenoura', 'crua'], evitar: ['cozido', 'suco', 'bolo'], preferir: ['s/ casca'] },
  'Alface crespa': { tokens: ['alface', 'crespa'], evitar: ['sanduíche'], preferir: ['crua'] },
  'Batata doce cozida': { tokens: ['batata', 'doce', 'cozido'], evitar: ['inglesa', 'frito', 'palito'], preferir: ['s/ óleo', 's/ sal', 's/ casca'] },
  'Batata inglesa cozida': { tokens: ['batata', 'inglesa', 'cozido'], evitar: ['camarão', 'ricota', 'espinafre', 'muçarela', 'frito', 'palha'], preferir: ['s/ óleo', 's/ sal', 's/ casca'] },
  'Macarrão cozido': { tokens: ['macarrão', 'cozido'], evitar: ['arroz', 'nhoque', 'lasanha', 'sopa'], preferir: ['trigo', 's/ ovos', 'drenado', 's/ sal'] },
  'Aveia em flocos': { tokens: ['aveia', 'flocos'], evitar: ['iogurte', 'bolo', 'cookie', 'vitamina', 'biscoito', 'neston'], preferir: ['crua', 'integral'] },
  'Pão de forma integral': { tokens: ['pão', 'forma', 'integral'], evitar: ['sanduíche', 'requeijão', 'presunto', 'light'], preferir: ['trigo', 'integral'] },
  'Tapioca': { tokens: ['tapioca'], evitar: ['coco', 'queijo', 'carne', 'banana', 'chocolate'], preferir: ['sem recheio', 'sem manteiga'] },
  'Laranja pera': { tokens: ['laranja', 'pera'], evitar: ['suco', 'doce', 'bolo', 'vitamina'], preferir: ['in natura'] },
  'Morango': { tokens: ['morango'], evitar: ['geleia', 'torta', 'bolo', 'suco', 'iogurte', 'sorvete', 'calda', 'chocolate'], preferir: ['in natura', 'cru'] },
  'Whey protein concentrado': { tokens: ['whey'], preferir: ['concentrado'] },
  'Tomate cru': { tokens: ['tomate', 'cru'], evitar: ['molho', 'concentrado', 'seco', 'cereja', 'salada'], preferir: ['in natura', 'lycopersicon'] },
};

type EntradaManual = { tokens: Set<string>; evitar: string[]; preferir: string[] };

/** Índice do mapa com chaves e tokens já normalizados. */
const MANUAL_IDX = new Map<string, EntradaManual>();
for (const [k, v] of Object.entries(MANUAL)) {
  MANUAL_IDX.set(normalizar(k).join(' '), {
    tokens: new Set(v.tokens.flatMap((t) => normalizar(t))),
    evitar: (v.evitar ?? []).map(tiraAcento),
    preferir: (v.preferir ?? []).map(tiraAcento),
  });
}

// ── Extração de micros (igual ao importador) ─────────────────────────

function parseValor(bruto: string): number | null {
  const s = (bruto ?? '').trim();
  if (!s) return null;
  const baixo = s.toLowerCase();
  if (baixo === 'na' || baixo === 'nd' || baixo === 'tr' || s === '-') return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extrairMicros(
  row: Linha,
  descartes: string[],
): Record<string, number | null> {
  const dados: Record<string, number | null> = {};
  for (const campo of MICRO) dados[campo] = null;

  let lipidios: number | null = null;
  for (const nut of row.nutrientes) {
    if (nut.Componente === 'Lipídios') {
      lipidios = parseValor(nut['Valor por 100g']);
      break;
    }
  }

  for (const nut of row.nutrientes) {
    const campo = MAPA[nut.Componente];
    if (!campo) continue;
    dados[campo] = parseValor(nut['Valor por 100g']);
  }

  for (const campo of MICRO) {
    const v = dados[campo];
    if (v === null) continue;
    const teto = LIMITES[campo];
    if (teto != null && v > teto) {
      descartes.push(`${campo}=${v} acima do teto ${teto}`);
      dados[campo] = null;
    }
  }

  if (lipidios != null && lipidios >= 0) {
    for (const campo of CAMPOS_ACIDOS) {
      const v = dados[campo];
      if (v === null) continue;
      if (v > lipidios * 1.1 + 0.1) {
        descartes.push(`${campo}=${v} excede lipídios ${lipidios}g`);
        dados[campo] = null;
      }
    }
    const soma = CAMPOS_ACIDOS.reduce((s, c) => s + (dados[c] ?? 0), 0);
    if (soma > lipidios * 1.15 + 0.2) {
      for (const campo of CAMPOS_ACIDOS) {
        if (dados[campo] === null) continue;
        descartes.push(`soma ácidos ${soma.toFixed(1)}g > lipídios ${lipidios}g`);
        dados[campo] = null;
      }
    }
  }

  return dados;
}

// ── Programa principal ───────────────────────────────────────────────

type Candidato = {
  codigo: string;
  classe: string;
  descricao: string;
  tokens: string[];
  micros: Record<string, number | null>;
};

type Match = {
  idAlimento: number;
  nome: string;
  classeAlimento: string | null;
  match: Candidato;
  score: number;
  segundo: Candidato | null;
  scoreSegundo: number;
  manual: boolean;
};

type ResultadoManual = {
  melhor: Candidato | null;
  segundo: Candidato | null;
  score: number;
  scoreSegundo: number;
  ambiguo: boolean;
  opcoes: Array<{ d: string; s: number }>;
  motivo: string;
};

/**
 * Seleção manual: filtra o pool pelos tokens obrigatórios e exclusões,
 * ranqueia por (preferências, menos tokens extras, descrição mais curta).
 * Empate real no topo -> ambíguo, para revisão humana.
 */
function selecionarManual(entry: EntradaManual, pool: Candidato[], tokensAlvo: string[]): ResultadoManual {
  const vivos = pool.filter((c) => {
    const desc = tiraAcento(c.descricao);
    if (entry.evitar.some((s) => desc.includes(s))) return false;
    const set = new Set(c.tokens);
    for (const t of entry.tokens) if (!set.has(t)) return false;
    return true;
  });

  if (vivos.length === 0) {
    return { melhor: null, segundo: null, score: 0, scoreSegundo: 0, ambiguo: false, opcoes: [], motivo: 'nenhuma linha TBCA passa nos filtros' };
  }

  const scored = vivos.map((c) => {
    const desc = tiraAcento(c.descricao);
    const prefer = entry.preferir.filter((s) => desc.includes(s)).length;
    const extras = c.tokens.filter((t) => !entry.tokens.has(t)).length;
    return { c, prefer, extras, sim: similaridade(tokensAlvo, c.tokens) };
  });

  scored.sort(
    (a, b) =>
      b.prefer - a.prefer ||
      a.extras - b.extras ||
      a.c.descricao.length - b.c.descricao.length,
  );

  const top = scored[0];
  const second = scored[1];

  // Empate real: mesmo nº de preferências e mesmos extras -> revisão humana.
  if (second && second.prefer === top.prefer && second.extras === top.extras) {
    return {
      melhor: null,
      segundo: null,
      score: top.sim,
      scoreSegundo: second.sim,
      ambiguo: true,
      opcoes: [
        { d: top.c.descricao, s: top.sim },
        { d: second.c.descricao, s: second.sim },
      ],
      motivo: 'empate entre duas linhas',
    };
  }

  return {
    melhor: top.c,
    segundo: second?.c ?? null,
    score: top.sim,
    scoreSegundo: second?.sim ?? 0,
    ambiguo: false,
    opcoes: [],
    motivo: '',
  };
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');

  // Localizar o JSONL (mesmos caminhos do importador)
  const aqui: string =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(process.argv[1] ?? process.cwd());
  const candidatosArquivo = [
    process.env.TBCA_JSONL,
    path.join(aqui, 'data', 'alimentos-tbca.jsonl'),
    path.join(aqui, '..', 'data', 'alimentos-tbca.jsonl'),
    path.join(process.cwd(), 'prisma', 'data', 'alimentos-tbca.jsonl'),
  ].filter((x): x is string => !!x);
  const arquivo = candidatosArquivo.find((c) => fs.existsSync(c));
  if (!arquivo) {
    console.error('Arquivo alimentos-tbca.jsonl não encontrado. Tentei:');
    for (const c of candidatosArquivo) console.error('  ' + c);
    process.exitCode = 1;
    return;
  }

  console.log(aplicar ? 'MODO APLICAR (vai gravar)' : 'MODO RELATÓRIO (nada grava)');
  console.log('Dump TBCA:', arquivo);

  // 1. Alimentos-alvo: com TODOS os 23 micros nulos (canônicos do Matheus).
  const alvos = await prisma.baseAlimento.findMany({
    where: {
      AND: MICRO.map((c) => ({ [c]: null })),
    },
    select: {
      id: true, nome: true, nomeExibicao: true, classeTbca: true, codigoTbca: true,
    },
  });
  console.log(`Alimentos-alvo (0/23 micros): ${alvos.length}`);

  // 2. Ler o dump e indexar por classe.
  const porClasse = new Map<string, Candidato[]>();
  const stream = fs.createReadStream(arquivo, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let linhasUteis = 0;
  for await (const linha of rl) {
    const t = linha.trim();
    if (!t) continue;
    let row: Linha;
    try {
      row = JSON.parse(t) as Linha;
    } catch {
      continue;
    }
    if (!row.codigo || !row.descricao) continue;
    const descartes: string[] = [];
    const micros = extrairMicros(row, descartes);
    const nPreenchidos = MICRO.filter((c) => typeof micros[c] === 'number').length;
    if (nPreenchidos < 10) continue; // linha TBCA muito vazia não serve de doadora
    const tokens = normalizar(row.descricao);
    if (tokens.length === 0) continue;
    const cand: Candidato = {
      codigo: row.codigo,
      classe: row.classe ?? '',
      descricao: row.descricao,
      tokens,
      micros,
    };
    const classe = cand.classe || '(sem classe)';
    if (!porClasse.has(classe)) porClasse.set(classe, []);
    porClasse.get(classe)!.push(cand);
    linhasUteis += 1;
  }
  console.log(`Linhas TBCA úteis (≥10 micros): ${linhasUteis}, indexadas por classe.`);

  // 3. Para cada alvo: mapa manual primeiro; regra genérica como fallback.
  const matches: Match[] = [];
  const ambiguos: Array<{ nome: string; classe: string | null; opcoes: Array<{ d: string; s: number }> }> = [];
  const semCandidato: string[] = [];

  // Todos os candidatos num array único, para alvo sem classeTbca.
  const todos: Candidato[] = [...porClasse.values()].flat();

  for (const alvo of alvos) {
    const nomeAlvo = alvo.nomeExibicao || alvo.nome;
    const tokensAlvo = normalizar(nomeAlvo);
    const classeAlimento = alvo.classeTbca;
    const manual = MANUAL_IDX.get(tokensAlvo.join(' '));

    // ── Camada 1: mapa manual ──
    if (manual) {
      const r = selecionarManual(manual, todos, tokensAlvo);
      if (!r.melhor && !r.ambiguo) {
        semCandidato.push(`${nomeAlvo} (manual: ${r.motivo})`);
        continue;
      }
      if (r.ambiguo) {
        ambiguos.push({ nome: `${nomeAlvo} [manual]`, classe: classeAlimento, opcoes: r.opcoes });
        continue;
      }
      matches.push({
        idAlimento: alvo.id,
        nome: nomeAlvo,
        classeAlimento,
        match: r.melhor!,
        score: r.score,
        segundo: r.segundo,
        scoreSegundo: r.scoreSegundo,
        manual: true,
      });
      continue;
    }

    // ── Camada 2: regra genérica ──
    const temClasse = !!classeAlimento && porClasse.has(classeAlimento);
    const pool = temClasse ? porClasse.get(classeAlimento)! : todos;
    const threshold = temClasse ? 0.55 : 0.60;

    let melhor: Candidato | null = null;
    let scoreMelhor = 0;
    let segundo: Candidato | null = null;
    let scoreSegundo = 0;

    for (const cand of pool) {
      const s = similaridade(tokensAlvo, cand.tokens);
      if (s > scoreMelhor) {
        segundo = melhor;
        scoreSegundo = scoreMelhor;
        melhor = cand;
        scoreMelhor = s;
      } else if (s > scoreSegundo) {
        segundo = cand;
        scoreSegundo = s;
      }
    }

    if (!melhor || scoreMelhor < threshold) {
      semCandidato.push(`${nomeAlvo} (melhor score ${scoreMelhor.toFixed(2)})`);
      continue;
    }

    const margemExigida = scoreMelhor >= 0.8 ? 0.05 : 0.10;
    if (scoreSegundo >= scoreMelhor - margemExigida) {
      ambiguos.push({
        nome: nomeAlvo,
        classe: classeAlimento,
        opcoes: [
          { d: melhor.descricao, s: scoreMelhor },
          { d: segundo?.descricao ?? '?', s: scoreSegundo },
        ],
      });
      continue;
    }

    matches.push({
      idAlimento: alvo.id,
      nome: nomeAlvo,
      classeAlimento,
      match: melhor,
      score: scoreMelhor,
      segundo,
      scoreSegundo,
      manual: false,
    });
  }

  // 4. Relatório.
  console.log('\n════════════════════════════════════════════════');
  console.log(`CASAMENTOS PROPOSTOS: ${matches.length} (${matches.filter((m) => m.manual).length} pelo mapa manual)`);
  console.log('════════════════════════════════════════════════');
  for (const m of matches.sort((a, b) => Number(b.manual) - Number(a.manual) || b.score - a.score)) {
    console.log(
      `  ${m.manual ? '[manual] ' : ''}${m.nome.padEnd(40)} -> [${m.match.classe}] ${m.match.descricao.slice(0, 40).padEnd(42)}` +
      `score ${m.score.toFixed(2)}${m.segundo ? ` (2º: ${m.segundo.descricao.slice(0, 26)} ${m.scoreSegundo.toFixed(2)})` : ''}`,
    );
  }

  if (ambiguos.length > 0) {
    console.log('\n════════════════════════════════════════════════');
    console.log(`AMBIGUOS (não casados — revisar à mão): ${ambiguos.length}`);
    console.log('════════════════════════════════════════════════');
    for (const a of ambiguos) {
      console.log(`  ${a.nome}`);
      for (const o of a.opcoes) console.log(`      ${o.s.toFixed(2)}  ${o.d}`);
    }
  }

  if (semCandidato.length > 0) {
    console.log('\n════════════════════════════════════════════════');
    console.log(`SEM CANDIDATO: ${semCandidato.length}`);
    console.log('════════════════════════════════════════════════');
    for (const s of semCandidato) console.log('  ' + s);
  }

  // 5. Aplicar (só com --aplicar).
  if (aplicar && matches.length > 0) {
    console.log('\nGravando...');
    let gravados = 0;
    for (const m of matches) {
      const dados: Record<string, number | null> = {};
      for (const campo of MICRO) dados[campo] = m.match.micros[campo] ?? null;
      await prisma.baseAlimento.update({ where: { id: m.idAlimento }, data: dados });
      gravados += 1;
    }
    console.log(`Gravados: ${gravados} alimentos.`);
  } else if (aplicar) {
    console.log('\nNada para gravar.');
  } else {
    console.log('\nRelatório pronto. Para gravar: npx tsx prisma/scripts/match-micros-por-nome.ts --aplicar');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
