import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const fixes = [
  {
    busca: 'queijo minas frescal',
    nome: 'Queijo minas frescal',
    exibicao: 'Queijo minas frescal',
  },
  {
    busca: 'queijo mucarela',
    nome: 'Queijo muçarela',
    exibicao: 'Queijo muçarela',
  },
  {
    busca: 'manteiga com sal',
    nome: 'Manteiga com sal',
    exibicao: 'Manteiga com sal',
  },
  {
    busca: 'pasta de amendoim integral',
    nome: 'Pasta de amendoim integral',
    exibicao: 'Pasta de amendoim integral',
  },
];

async function main() {
  for (const f of fixes) {
    const r = await prisma.baseAlimento.updateMany({
      where: { nomeBusca: f.busca },
      data: { nome: f.nome, nomeExibicao: f.exibicao },
    });
    console.log(r.count ? `✅ ${f.exibicao}` : `⚠️  não achou: ${f.busca}`);
  }
  await prisma.$disconnect();
}

main();