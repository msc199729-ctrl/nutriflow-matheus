import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

async function main() {
  const keys = Object.keys(p).filter((k) => !k.startsWith('_') && !k.startsWith('$'));
  console.log('=== ACESSORES DISPONÍVEIS NO PRISMA CLIENT ===');
  for (const k of keys.sort()) console.log(`  p.${k}`);
  await p.$disconnect();
}

main();