/**
 * Casamento por NOME: preenche micronutrientes de alimentos canônicos
 * (criados fora da TBCA, sem codigoTbca) usando linhas da TBCA por
 * semelhança de nome.
 *
 * Uso (na raiz do backend):
 *   npx tsx prisma/scripts/match-micros-por-nome.ts            # relatório (nada grava)
 *   npx tsx prisma/scripts/match-micros-por-nome.ts --aplicar  # grava de verdade
 *
 * SALVAGUARDAS (por que é seguro):
 *   1. Só toca em alimento SEM nenhum micronutriente (não sobrescreve nada).
 *   2. Match exige similaridade de nome alta (Jaccard + cobertura de tokens).
 *   3. Exige a MESMA classe TBCA (ex.: "Vegetais" com "Vegetais") — brócolis
 *      não casa com suplemento.
 *   4. Se duas linhas da TBCA empatam em cima, NÃO casa: marca para revisão.
 *   5. Validações do importador (teto de sanidade, soma de ácidos graxos)
 *      são aplicadas antes de gravar.
 *   6. Atribui codigoTbca? NÃO — o campo é @unique e o alimento canônico não
 *      é uma linha TBCA. Deixa null; a rastreabilidade fica no relatório.
 *
 * O relatório mostra cada casamento com o score, para revisão.
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

/** Remove acentos, minúsculas, tira ruído e stopwords de descrição de alimento. */
function normalizar(s: string): string[] {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .filter((t) => !['de', 'da', 'do', 'das', 'dos', 'com', 'em', 'e', 'a', 'o'].includes(t));
}

/**
 * Similaridade entre nomes de alimento: 60% Jaccard de tokens + 40% cobertura
 * (fração dos tokens do MENOR nome presentes no maior). Cobertura alta com
 * Jaccard médio é o padrão "nome canônico é subconjunto da descrição TBCA".
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
};

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

  // 3. Para cada alvo, procurar o melhor candidato na MESMA classe.
  const matches: Match[] = [];
  const ambiguos: Array<{ nome: string; classe: string | null; opcoes: Array<{ d: string; s: number }> }> = [];
  const semClasse: string[] = [];
  const semCandidato: string[] = [];

  for (const alvo of alvos) {
    const nomeAlvo = alvo.nomeExibicao || alvo.nome;
    const tokensAlvo = normalizar(nomeAlvo);
    const classeAlimento = alvo.classeTbca;

    if (!classeAlimento || !porClasse.has(classeAlimento)) {
      semClasse.push(nomeAlvo);
      continue;
    }

    const pool = porClasse.get(classeAlimento)!;
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

    if (!melhor || scoreMelhor < 0.55) {
      semCandidato.push(`${nomeAlvo} (melhor score ${scoreMelhor.toFixed(2)})`);
      continue;
    }

    // Ambiguidade: segundo muito perto do primeiro -> não casa automaticamente.
    if (scoreSegundo >= scoreMelhor - 0.05 && scoreSegundo > 0.55) {
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
    });
  }

  // 4. Relatório.
  console.log('\n════════════════════════════════════════════════');
  console.log(`CASAMENTOS PROPOSTOS: ${matches.length}`);
  console.log('════════════════════════════════════════════════');
  for (const m of matches.sort((a, b) => b.score - a.score)) {
    console.log(
      `  ${m.nome.padEnd(40)} -> ${m.match.descricao.slice(0, 44).padEnd(46)}` +
      `score ${m.score.toFixed(2)}${m.segundo ? ` (2º: ${m.segundo.descricao.slice(0, 30)} ${m.scoreSegundo.toFixed(2)})` : ''}`,
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
    console.log(`SEM CANDIDATO NA CLASSE: ${semCandidato.length}`);
    console.log('════════════════════════════════════════════════');
    for (const s of semCandidato) console.log('  ' + s);
  }

  if (semClasse.length > 0) {
    console.log(`\nSem classeTbca ou classe sem linhas no dump: ${semClasse.length}`);
    for (const s of semClasse.slice(0, 20)) console.log('  ' + s);
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
