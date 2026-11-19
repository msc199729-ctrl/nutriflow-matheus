import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

async function main() {
  const itens = await p.itemDieta.findMany({
    select: {
      id: true,
      quantidadeGramas: true,
      quantidadeMedida: true,
      medidaRef: { select: { nome: true, gramas: true } },
      alimento: { select: { nomeExibicao: true } },
    },
  });

  for (const i of itens) {
    const medida = i.medidaRef
      ? `${i.quantidadeMedida} × ${i.medidaRef.nome} (${Number(i.medidaRef.gramas)}g)`
      : '❌ sem medida';
    console.log(`${i.alimento?.nomeExibicao} | ${i.quantidadeGramas}g | ${medida}`);
  }

  await p.$disconnect();
}

main();