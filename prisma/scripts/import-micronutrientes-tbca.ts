/**
 * Importador de micronutrientes da TBCA para `base_alimentos`.
 *
 * Uso:
 *   npx tsx prisma/scripts/import-micronutrientes-tbca.ts
 *   npx tsx prisma/scripts/import-micronutrientes-tbca.ts --dry-run
 *
 * Pré-requisito: a migração 20261124000000_add_micronutrientes já aplicada.
 *
 * ─── DEFEITOS CONHECIDOS DO DUMP (tratados aqui) ──────────────────────────
 *
 * 1. VALORES AUSENTES VÊM COMO "-"
 *    Além de "NA", "ND" e "tr", o dump usa "-" para ausência de dado (não zero).
 *    Tratar "-" como 0 subestimaria vitaminas de forma silenciosa. Aqui vira null.
 *
 * 2. COLESTEROL COM UNIDADE ERRADA EM 269 LINHAS
 *    Parte das linhas traz Unidades = "g" mas o valor está em mg (ex.: 520 "g"
 *    de colesterol por 100 g é impossível; 520 mg é plausível). Quando a unidade
 *    é "g" e o valor é > 5, o valor é interpretado como mg. Os zeros ficam zero.
 *    Ver o relatório rodando com --dry-run.
 *
 * 3. TETO DE SANIDADE
 *    Valores fisicamente impossíveis (ferro 907 mg/100 g) são anulados. Tetos
 *    calibrados sobre a distribuição real do dump + máximos de literatura.
 *
 * 4. SOMA DOS ÁCIDOS GRAXOS
 *    Cada ácido pode caber no total de lipídios e a soma estourar (ex.:
 *    "Azeite, oliva, assado" com 60 g de poliinsaturados). Nesse caso os
 *    quatro ácidos são anulados juntos.
 *
 * ─── LIMITES DA FONTE (não são bugs) ──────────────────────────────────────
 * - Vitamina K, B5, biotina, manganês, cromo e iodo não existem no dump.
 * - Niacina é mg total (a DRI usa mg NE); folato é equivalente de folato
 *   (a DRI usa mcg DFE). São aproximações, sinalizadas na UI.
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

/** Componente da TBCA -> coluna do banco. Precisa espelhar o schema. */
const MAPA: Record<string, string> = {
  // Nomes dos campos conforme o model BaseAlimento do schema.prisma.
  // Vitamina A: usa RAE (o schema também tem RE; RAE é o padrão da DRI).
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

/** Colunas Prisma (camelCase) que o update vai escrever. */
const CAMPOS = Object.values(MAPA);

type Linha = {
  codigo: string;
  classe: string;
  descricao: string;
  nutrientes: Array<{ Componente: string; Unidades: string; 'Valor por 100g': string }>;
};

/** "1,34" -> 1.34 | "NA" | "ND" | "tr" | "-" | "" -> null */
function parseValor(bruto: string): number | null {
  const s = (bruto ?? '').trim();
  if (!s) return null;
  const baixo = s.toLowerCase();
  if (baixo === 'na' || baixo === 'nd' || baixo === 'tr' || s === '-') return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

type Estatisticas = {
  alimentos: number;
  atualizados: number;
  semMatch: number;
  colesterolGramasCorrigido: number;
  colesterolGramasZero: number;
  linhasSemCodigo: number;
  /** valores anulados por inconsistência física */
  descartados: Array<{ codigo: string; campo: string; valor: number; motivo: string }>;
};

/** Teto de sanidade por nutriente (por 100 g). Acima disso, é erro de dado. */
const LIMITES: Record<string, number> = {
  // Calibrados sobre a distribuição real do dump (p99.9) + máximos
  // fisiologicamente plausíveis. Um teto folgado deixa passar erro grosseiro:
  // com teto de 100 mg, o cobre do leite em pó (52 mg) passaria, e fígado —
  // o alimento mais rico — tem no máximo ~15 mg.
  calcio: 5000,             // leite em pó desnatado ~1300
  ferro: 100,               // fígado/bivalves ~40; 907 numa torrada é erro
  magnesio: 1200,           // sementes de abóbora/cacau ~550
  fosforo: 3000,            // leite em pó/sementes ~1200
  potassio: 25000,          // sal substituto (KCl) chega a ~20000
  zinco: 100,               // ostras ~60
  cobre: 30,                // fígado ~15
  selenio: 3000,            // castanha-do-pará varia com o solo, até ~2000
  vitaminaARae: 100000,     // óleo de fígado de bacalhau ~30000
  vitaminaC: 5000,          // camu-camu ~2000
  vitaminaD: 1000,          // óleo de fígado de peixe ~250
  vitaminaE: 500,
  tiamina: 50,              // levedura de cerveja ~12
  vitaminaB2: 50,           // levedura ~10
  vitaminaB3: 100,
  vitaminaB6: 20,           // máximo real ~3
  vitaminaB12: 200,         // fígado ~70
  folato: 5000,             // levedura ~2000
  gorduraSaturada: 100,
  gorduraMonoinsaturada: 100, // nenhum alimento passa de ~100 (óleo puro)
  gorduraPoliinsaturada: 100,
  gorduraTrans: 50,
  colesterol: 5000,         // gema desidratada ~2000
};

const CAMPOS_ACIDOS = [
  'gorduraSaturada',
  'gorduraMonoinsaturada',
  'gorduraPoliinsaturada',
  'gorduraTrans',
];

function extrairMicros(
  row: Linha,
  stats: Estatisticas,
): Record<string, number | null> {
  const dados: Record<string, number | null> = {};
  for (const campo of CAMPOS) dados[campo] = null;

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

    const valor = parseValor(nut['Valor por 100g']);

    // Defeito 2: colesterol marcado como gramas mas com valor em mg.
    if (campo === 'colesterol' && nut.Unidades === 'g' && valor !== null) {
      if (valor === 0) stats.colesterolGramasZero += 1;
      else stats.colesterolGramasCorrigido += 1;
    }

    dados[campo] = valor;
  }

  // Defeito 3: valor acima do teto de sanidade -> descarta.
  for (const campo of CAMPOS) {
    const v = dados[campo];
    if (v === null) continue;
    const teto = LIMITES[campo];
    if (teto != null && v > teto) {
      stats.descartados.push({
        codigo: row.codigo,
        campo,
        valor: v,
        motivo: `acima do teto de sanidade (${teto})`,
      });
      dados[campo] = null;
    }
  }

  // Defeito 4: ácido graxo maior que o total de lipídios -> inconsistência
  // física. Anula só aquele ácido (o total de lipídios continua válido).
  if (lipidios != null && lipidios >= 0) {
    for (const campo of CAMPOS_ACIDOS) {
      const v = dados[campo];
      if (v === null) continue;
      // margem de 10% + 0,1 g para arredondamento da fonte
      if (v > lipidios * 1.1 + 0.1) {
        stats.descartados.push({
          codigo: row.codigo,
          campo,
          valor: v,
          motivo: `excede lipídios totais (${lipidios} g)`,
        });
        dados[campo] = null;
      }
    }

    // Defeito 5: a SOMA dos ácidos graxos não pode passar dos lipídios totais.
    // Cada ácido individualmente pode caber no total e a soma estourar — foi o
    // caso do "Azeite, oliva, assado" com 60 g de poliinsaturados (azeite real
    // tem ~10%), que passou pela checagem por campo. Quando a soma estoura,
    // o conjunto está errado: anula os quatro.
    const soma = CAMPOS_ACIDOS.reduce((s, c) => s + (dados[c] ?? 0), 0);
    if (soma > lipidios * 1.15 + 0.2) {
      for (const campo of CAMPOS_ACIDOS) {
        if (dados[campo] === null) continue;
        stats.descartados.push({
          codigo: row.codigo,
          campo,
          valor: dados[campo] as number,
          motivo: `soma dos ácidos graxos (${soma.toFixed(1)} g) excede lipídios (${lipidios} g)`,
        });
        dados[campo] = null;
      }
    }
  }

  return dados;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // O JSONL fica em prisma/data/. Este script pode ter sido copiado para
  // prisma/ (junto do seed) ou para prisma/scripts/ — procura nos dois e
  // também permite apontar o arquivo por variável de ambiente.
  // __dirname não existe em ESM; derive do caminho do argv[1] nesse caso.
  const aqui: string =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(process.argv[1] ?? process.cwd());

  const candidatos = [
    process.env.TBCA_JSONL,
    path.join(aqui, 'data', 'alimentos-tbca.jsonl'),          // prisma/
    path.join(aqui, '..', 'data', 'alimentos-tbca.jsonl'),     // prisma/scripts/
    path.join(process.cwd(), 'prisma', 'data', 'alimentos-tbca.jsonl'),
  ].filter((x): x is string => !!x);

  let arquivo = candidatos.find((c) => fs.existsSync(c));
  if (!arquivo) {
    console.error('Arquivo alimentos-tbca.jsonl não encontrado. Tentei:');
    for (const c of candidatos) console.error('  ' + c);
    console.error(
      'Passe o caminho: $env:TBCA_JSONL="C:\\...\\alimentos-tbca.jsonl"  (PowerShell)',
    );
    process.exitCode = 1;
    return;
  }

  console.log(dryRun ? 'MODO DRY-RUN (nada será gravado)' : 'IMPORTANDO');
  console.log('Arquivo:', arquivo);

  // codigoTbca -> id, para casar sem fazer uma consulta por linha.
  const existentes = await prisma.baseAlimento.findMany({
    where: { codigoTbca: { not: null } },
    select: { id: true, codigoTbca: true },
  });
  const porCodigo = new Map(existentes.map((a) => [a.codigoTbca as string, a.id]));
  console.log(`Alimentos com codigoTbca no banco: ${porCodigo.size}`);

  const stats: Estatisticas = {
    alimentos: 0,
    atualizados: 0,
    semMatch: 0,
    colesterolGramasCorrigido: 0,
    colesterolGramasZero: 0,
    linhasSemCodigo: 0,
    descartados: [],
  };

  type Pendente = { id: number; dados: Record<string, number | null> };
  let lote: Pendente[] = [];

  const gravar = async () => {
    if (dryRun || lote.length === 0) {
      lote = [];
      return;
    }
    // Uma transação por lote: rápido e seguro. updateMany por id não serve
    // porque cada linha tem valores diferentes.
    await prisma.$transaction(
      lote.map((p) => prisma.baseAlimento.update({ where: { id: p.id }, data: p.dados })),
    );
    lote = [];
  };

  const stream = fs.createReadStream(arquivo, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const linha of rl) {
    const t = linha.trim();
    if (!t) continue;

    let row: Linha;
    try {
      row = JSON.parse(t) as Linha;
    } catch {
      console.warn('JSON inválido, linha ignorada.');
      continue;
    }

    stats.alimentos += 1;
    if (!row.codigo) {
      stats.linhasSemCodigo += 1;
      continue;
    }

    const id = porCodigo.get(row.codigo);
    if (!id) {
      stats.semMatch += 1;
      continue;
    }

    const dados = extrairMicros(row, stats);
    stats.atualizados += 1;
    lote.push({ id, dados });
    if (lote.length >= 200) await gravar();
  }

  await gravar();

  console.log('\n─── RESULTADO ─────────────────────────────');
  console.log('Alimentos lidos:                  ', stats.alimentos);
  console.log('Atualizados:                      ', stats.atualizados);
  console.log('Sem match por codigoTbca:         ', stats.semMatch);
  console.log('Linhas sem código:                ', stats.linhasSemCodigo);
  console.log('Colesterol (unidade "g") corrigido:', stats.colesterolGramasCorrigido);
  console.log('Colesterol (unidade "g") zero:    ', stats.colesterolGramasZero);
  console.log('Valores descartados por sanidade: ', stats.descartados.length);
  if (stats.descartados.length > 0) {
    const porCampo = new Map<string, number>();
    for (const d of stats.descartados) {
      porCampo.set(d.campo, (porCampo.get(d.campo) ?? 0) + 1);
    }
    for (const [campo, n] of [...porCampo.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${campo}: ${n}`);
    }
    if (dryRun) {
      console.log('   (detalhe dos 10 primeiros)');
      for (const d of stats.descartados.slice(0, 10)) {
        console.log(`   ${d.codigo} ${d.campo}=${d.valor} — ${d.motivo}`);
      }
    }
  }
  console.log('───────────────────────────────────────────');
  if (dryRun) console.log('Dry-run: nada foi gravado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
