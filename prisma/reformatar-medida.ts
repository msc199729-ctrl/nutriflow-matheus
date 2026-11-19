import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

async function main() {
  const itens = await p.itemDieta.findMany({
    where: { idMedidaCaseira: { not: null } },
    select: { id: true, quantidadeMedida: true, medidaCaseira: true },
  });

  let atualizados = 0;
  for (const it of itens) {
    if (!it.medidaCaseira) continue;
    const nome = it.medidaCaseira.replace(/^\d+(\.\d+)?\s*[×x]\s*/, '').trim();
    const q = it.quantidadeMedida ?? 1;
    const novo = q === 1 ? `1 ${nome}` : `${q} ${nome}`;
    if (novo !== it.medidaCaseira) {
      await p.itemDieta.update({ where: { id: it.id }, data: { medidaCaseira: novo } });
      console.log(`id ${it.id}: "${it.medidaCaseira}" → "${novo}"`);
      atualizados++;
    }
  }
  console.log(`\nAtualizados: ${atualizados}`);
  await p.$disconnect();
}

main();