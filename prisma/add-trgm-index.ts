import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

async function main() {
  console.log("Criando extensão pg_trgm...");
  await p.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

  console.log("Criando índice GIN em base_alimentos.nome_busca...");
  await p.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS base_alimentos_nome_busca_trgm
    ON base_alimentos USING gin (nome_busca gin_trgm_ops);
  `);

  const idx = await p.$queryRawUnsafe<Array<{ indexname: string }>>(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'base_alimentos' AND indexname LIKE '%trgm%';
  `);
  console.log("Índices encontrados:", idx);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});