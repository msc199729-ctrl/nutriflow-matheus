import 'dotenv/config';
import * as fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Frente 3: importa as medidas caseiras da TBCA (scrapadas do site oficial,
 * base "Composição de Alimentos em Medidas Caseiras") para a tabela
 * MedidaCaseira, ligando cada medida ao alimento por codigo_tbca.
 *
 * Regras:
 * - Só toca em alimentos TBCA (casados por codigo_tbca).
 * - Não duplica: upsert pela constraint única (alimentoId, nome).
 * - Medida padrão: a primeira da lista da TBCA (ordem original do site).
 * - Nomes normalizados no padrão do dropdown: "Colher de sopa cheia",
 *   "Escumadeira rasa", "Unidade/Fatia (média)" etc.
 *
 * Uso: npx tsx prisma/import-medidas-tbca.ts
 * (espera prisma/data/medidas-tbca.json — ver docs/FRENTES-2-3.md)
 */

type MedidaScrape = { nome: string; gramas: number };

type DadosMedidas = Record<string, MedidaScrape[]>;

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

/** Normaliza o nome da medida pro padrão de exibição do NutriFlow. */
function normalizarNome(raw: string): string {
  let n = raw.replace(/\s+/g, ' ').trim();
  // "Colher sopa cheia" → "Colher de sopa cheia" (padrão do dropdown)
  n = n.replace(/^Colher sopa\b/i, 'Colher de sopa');
  n = n.replace(/^Colher chá\b/i, 'Colher de chá');
  n = n.replace(/^Colher sobremesa\b/i, 'Colher de sobremesa');
  n = n.replace(/^Pedaço\/ Unidade\/ Fatia \(M\)/i, 'Unidade/Fatia (média)');
  n = n.replace(/^Pedaço\/ Unidade\/ Fatia \(P\)/i, 'Unidade/Fatia (pequena)');
  n = n.replace(/^Pedaço\/ Unidade\/ Fatia \(G\)/i, 'Unidade/Fatia (grande)');
  return n;
}

async function main() {
  const filePath = process.argv[2] ?? 'prisma/data/medidas-tbca.json';
  if (!fs.existsSync(filePath)) {
    console.error('Arquivo não encontrado:', filePath);
    console.error(
      'Gere o scrape primeiro (ver docs/FRENTES-2-3.md). Ou passe o caminho: npx tsx prisma/import-medidas-tbca.ts <caminho>',
    );
    process.exit(1);
  }

  const dados = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DadosMedidas;

  const adapter = new PrismaPg({ connectionString: getConnectionString() });
  const prisma = new PrismaClient({ adapter });

  const codigos = Object.keys(dados);
  console.log(`Arquivo: ${codigos.length} alimentos com medidas.`);

  let processados = 0;
  let criadas = 0;
  let atualizadas = 0;
  let semAlimento = 0;
  let semMedidas = 0;

  for (const codigo of codigos) {
    const alimento = await prisma.baseAlimento.findFirst({
      where: { codigoTbca: codigo },
      select: { id: true },
    });
    if (!alimento) {
      semAlimento++;
      continue;
    }
    const medidas = dados[codigo];
    if (!medidas || medidas.length === 0) {
      semMedidas++;
      continue;
    }

    for (let i = 0; i < medidas.length; i++) {
      const m = medidas[i];
      const nome = normalizarNome(m.nome);
      if (!nome || !(m.gramas > 0)) continue;

      const existing = await prisma.medidaCaseira.findFirst({
        where: { alimentoId: alimento.id, nome },
        select: { id: true },
      });
      if (existing) {
        await prisma.medidaCaseira.update({
          where: { id: existing.id },
          data: { gramas: m.gramas, ordem: i, padrao: i === 0 },
        });
        atualizadas++;
      } else {
        await prisma.medidaCaseira.create({
          data: {
            alimentoId: alimento.id,
            nome,
            gramas: m.gramas,
            ordem: i,
            padrao: i === 0,
          },
        });
        criadas++;
      }
    }
    processados++;
    if (processados % 100 === 0) {
      console.log(
        `  ${processados}/${codigos.length} alimentos | ${criadas} medidas criadas, ${atualizadas} atualizadas`,
      );
    }
  }

  console.log('---------------------------------------------');
  console.log('Import medidas TBCA concluído.');
  console.log('  Alimentos processados:', processados);
  console.log('  Medidas criadas:', criadas);
  console.log('  Medidas atualizadas:', atualizadas);
  console.log('  Alimentos sem match no banco:', semAlimento);
  console.log('  Alimentos sem medidas no scrape:', semMedidas);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
