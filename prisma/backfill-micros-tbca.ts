import 'dotenv/config';
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Backfill dos micronutrientes da TBCA (Frente 1).
 *
 * O dump prisma/data/alimentos-tbca.jsonl sempre teve o perfil completo de
 * nutrientes (~35 componentes por alimento), mas o seed antigo gravava apenas
 * 6 (kcal, proteína, carboidrato, lipídios, fibra e sódio). Este script
 * reprocessa o dump e atualiza os campos novos da base_alimentos via
 * codigo_tbca, sem tocar nos 6 campos antigos nem em alimentos de outras
 * fontes (Open Food Facts etc.).
 *
 * Uso: npx tsx prisma/backfill-micros-tbca.ts
 * (rodar depois de `prisma migrate dev` aplicar a migração de micros)
 */

type TbcaNutriente = {
  Componente: string;
  Unidades: string;
  'Valor por 100g': string;
};

type TbcaAlimentoRow = {
  codigo: string;
  classe: string;
  descricao: string;
  nutrientes: TbcaNutriente[];
};

const VALOR_KEY = 'Valor por 100g' as const;

function parseValor100(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === 'NA' || s === 'ND' || s.toLowerCase() === 'tr') return null;
  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Extrai valor por 100g do componente, opcionalmente filtrando a unidade. */
function nutriente(
  nutrientes: TbcaNutriente[],
  componente: string,
  unidades?: string,
): number | null {
  const found = unidades
    ? nutrientes.find(
        (x) => x.Componente === componente && x.Unidades === unidades,
      )
    : nutrientes.find((x) => x.Componente === componente);
  return found ? parseValor100(found[VALOR_KEY]) : null;
}

/**
 * Colesterol: 5.398 alimentos trazem mg, mas 270 trazem o valor em "g" —
 * claramente um deslize de unidade do dump (panqueca com 48,7 g de
 * colesterol seria letal; a TBCA publica em mg). Convertemos g → mg.
 */
function colesterolMg(nutrientes: TbcaNutriente[]): number | null {
  const mg = nutriente(nutrientes, 'Colesterol', 'mg');
  if (mg != null) return mg;
  const g = nutriente(nutrientes, 'Colesterol', 'g');
  if (g != null) return g * 1000;
  return null;
}

function rowToMicros(row: TbcaAlimentoRow) {
  const n = row.nutrientes;
  return {
    // Minerais
    calcio: nutriente(n, 'Cálcio'),
    ferro: nutriente(n, 'Ferro'),
    magnesio: nutriente(n, 'Magnésio'),
    fosforo: nutriente(n, 'Fósforo'),
    potassio: nutriente(n, 'Potássio'),
    zinco: nutriente(n, 'Zinco'),
    cobre: nutriente(n, 'Cobre'),
    selenio: nutriente(n, 'Selênio'),
    // Vitaminas
    vitaminaARe: nutriente(n, 'Vitamina A (RE)'),
    vitaminaARae: nutriente(n, 'Vitamina A (RAE)'),
    vitaminaD: nutriente(n, 'Vitamina D'),
    vitaminaE: nutriente(n, 'Alfa-tocoferol (Vitamina E)'),
    tiamina: nutriente(n, 'Tiamina'),
    vitaminaB2: nutriente(n, 'Riboflavina'),
    vitaminaB3: nutriente(n, 'Niacina'),
    vitaminaB6: nutriente(n, 'Vitamina B6'),
    vitaminaB12: nutriente(n, 'Vitamina B12'),
    vitaminaC: nutriente(n, 'Vitamina C'),
    folato: nutriente(n, 'Equivalente de folato'),
    // Lipídeos
    colesterol: colesterolMg(n),
    gorduraSaturada: nutriente(n, 'Ácidos graxos saturados'),
    gorduraMonoinsaturada: nutriente(n, 'Ácidos graxos monoinsaturados'),
    gorduraPoliinsaturada: nutriente(n, 'Ácidos graxos poliinsaturados'),
    gorduraTrans: nutriente(n, 'Ácidos graxos trans'),
    // Outros
    umidade: nutriente(n, 'Umidade'),
    carboidratoTotal: nutriente(n, 'Carboidrato total'),
    acucarAdicao: nutriente(n, 'Açúcar de adição'),
    salAdicao: nutriente(n, 'Sal de adição'),
    alcool: nutriente(n, 'Álcool'),
  };
}

const BATCH = 50;

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const user = process.env.DB_USER ?? 'postgres';
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const name = process.env.DB_NAME ?? 'nutriflow';
  return `postgresql://${user}:${password}@${host}:${port}/${name}?schema=public`;
}

async function main() {
  const filePath = path.join(__dirname, 'data', 'alimentos-tbca.jsonl');
  if (!fs.existsSync(filePath)) {
    console.error('Arquivo não encontrado:', filePath);
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: getConnectionString() });
  const prisma = new PrismaClient({ adapter });

  let count = 0;
  let atualizados = 0;
  let naoEncontrados = 0;
  const naoEncontradosExemplos: string[] = [];
  const batch: TbcaAlimentoRow[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    for (const row of batch) {
      const micros = rowToMicros(row);
      const updated = await prisma.baseAlimento.updateMany({
        where: { codigoTbca: row.codigo },
        data: micros,
      });
      if (updated.count > 0) atualizados += updated.count;
      else {
        naoEncontrados++;
        if (naoEncontradosExemplos.length < 5) {
          naoEncontradosExemplos.push(`${row.codigo} ${row.descricao.slice(0, 50)}`);
        }
      }
    }
    count += batch.length;
    console.log(`  ${count} alimentos processados...`);
    batch.length = 0;
  };

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed) as TbcaAlimentoRow;
    if (!row.codigo) continue;
    batch.push(row);
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  console.log('---------------------------------------------');
  console.log('Backfill TBCA micros concluído.');
  console.log('  Linhas do dump:', count);
  console.log('  Alimentos atualizados:', atualizados);
  console.log('  Códigos sem match no banco:', naoEncontrados);
  if (naoEncontradosExemplos.length > 0) {
    console.log('  Exemplos sem match:', naoEncontradosExemplos.join(' | '));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
