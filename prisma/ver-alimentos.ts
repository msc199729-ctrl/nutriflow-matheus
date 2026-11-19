import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL
  ?? `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD ?? '')}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?schema=public`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

async function main() {
  const total = await prisma.baseAlimento.count();
  console.log('Total de alimentos:', total);

  const r = await prisma.baseAlimento.findMany({
    take: 10,
    select: { id: true, nome: true, nomeExibicao: true },
    orderBy: { id: 'asc' },
  });
  console.log(JSON.stringify(r, null, 2));

  await prisma.$disconnect();
}

main();