import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

async function main() {
  const itens = await p.itemDieta.findMany({
    orderBy: { id: 'desc' },
    take: 4,
    select: {
      id: true,
      idMedidaCaseira: true,
      quantidadeMedida: true,
      quantidadeGramas: true,
      medidaCaseira: true,
      alimento: { select: { id: true, nome: true, nomeExibicao: true } },
    },
  });

  for (const it of itens) {
    console.log(`\nid ${it.id} — ${it.alimento.nomeExibicao ?? it.alimento.nome}`);
    console.log(`  idMedidaCaseira: ${it.idMedidaCaseira ?? 'NULL'}`);
    console.log(`  quantidadeMedida: ${it.quantidadeMedida ?? 'NULL'}`);
    console.log(`  quantidadeGramas: ${it.quantidadeGramas}`);
    console.log(`  medidaCaseira (texto): ${it.medidaCaseira ?? 'NULL'}`);

    if (it.idMedidaCaseira) {
      const m = await p.medidaCaseira.findUnique({
        where: { id: it.idMedidaCaseira },
        select: { nome: true, gramas: true },
      });
      console.log(`  → medida: ${m?.nome} (${m?.gramas}g)`);
    }
  }

  await p.$disconnect();
}

main();