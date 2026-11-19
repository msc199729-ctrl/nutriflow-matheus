import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';

const url = process.env.DATABASE_URL
  ?? `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD ?? '')}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?schema=public`;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const backup = JSON.parse(fs.readFileSync('backup-alimentos-2026-11-08.json', 'utf-8'));
  console.log(`Limpando campos de ${backup.length} alimentos...`);

  for (const a of backup) {
    await prisma.baseAlimento.update({
      where: { id: a.id },
      data: { nomeExibicao: null, nomeBusca: null },
    });
  }
  console.log('✅ Campos limpos.');
  await prisma.$disconnect();
}

main();