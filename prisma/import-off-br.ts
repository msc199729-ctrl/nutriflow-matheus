import 'dotenv/config';
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Frente 2: importa industrializados brasileiros do Open Food Facts.
 *
 * Fonte: export mundial do OFF (openfoodfacts-products.jsonl) filtrado por
 * countries_tags=en:brazil + tabela nutricional completa + código de barras
 * válido. O filtro gera um JSONL slim (off-br-slim.jsonl) que este script
 * importa para base_alimentos.
 *
 * Regras:
 * - Dedupe por codigo_barras (upsert): produto já existente é ATUALIZADO.
 * - Não toca em alimentos TBCA (só insere/atualiza os que têm codigo_barras).
 * - eh_ultraprocessado = nova_group === 4; score_nova = nova_group (1-4).
 * - fonte = 'Open Food Facts'.
 *
 * Uso: npx tsx prisma/import-off-br.ts
 * (espera prisma/data/off-br-slim.jsonl — ver docs/FRENTES-2-3.md)
 */

type OffSlim = {
  code: string;
  nome: string;
  marca: string | null;
  nova: number | null;
  kcal: number;
  prot: number;
  carb: number;
  gord: number;
  fibra: number | null;
  sodio_mg: number | null;
};

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

/** Nome de exibição limpo: "Produto X — Marca Y" quando tem marca. */
function nomeExibicao(p: OffSlim): string {
  const base = p.nome.replace(/\s+/g, ' ').trim();
  return p.marca ? `${base} — ${p.marca}` : base;
}

/** Chave de busca normalizada (mesmo padrão do nome_busca da base). */
function nomeBusca(p: OffSlim): string {
  return nomeExibicao(p)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function main() {
  const filePath = process.argv[2] ?? 'prisma/data/off-br-slim.jsonl';
  if (!fs.existsSync(filePath)) {
    console.error('Arquivo não encontrado:', filePath);
    console.error(
      'Gere com o filtro: ver docs/FRENTES-2-3.md. Ou passe o caminho: npx tsx prisma/import-off-br.ts <caminho>',
    );
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: getConnectionString() });
  const prisma = new PrismaClient({ adapter });

  let lidas = 0;
  let criados = 0;
  let atualizados = 0;
  const batch: OffSlim[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    for (const p of batch) {
      const data = {
        nome: p.nome,
        nomeExibicao: nomeExibicao(p),
        nomeBusca: nomeBusca(p),
        marca: p.marca,
        fonte: 'Open Food Facts',
        calorias: p.kcal,
        proteinas: p.prot,
        carboidratos: p.carb,
        gorduras: p.gord,
        fibras: p.fibra,
        sodio: p.sodio_mg,
        ehUltraprocessado: p.nova === 4,
        scoreNova:
          typeof p.nova === 'number' && p.nova >= 1 && p.nova <= 4 ? p.nova : null,
      };
      const existing = await prisma.baseAlimento.findUnique({
        where: { codigoBarras: p.code },
        select: { id: true },
      });
      if (existing) {
        await prisma.baseAlimento.update({ where: { id: existing.id }, data });
        atualizados++;
      } else {
        await prisma.baseAlimento.create({
          data: { ...data, codigoBarras: p.code },
        });
        criados++;
      }
    }
    lidas += batch.length;
    console.log(`  ${lidas} produtos processados (${criados} novos, ${atualizados} atualizados)...`);
    batch.length = 0;
  };

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let p: OffSlim;
    try {
      p = JSON.parse(trimmed) as OffSlim;
    } catch {
      continue;
    }
    if (!p.code || !p.nome) continue;
    batch.push(p);
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  console.log('---------------------------------------------');
  console.log('Import OFF BR concluído.');
  console.log('  Produtos lidos:', lidas);
  console.log('  Criados:', criados);
  console.log('  Atualizados:', atualizados);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
