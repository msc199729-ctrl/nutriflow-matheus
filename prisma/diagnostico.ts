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
      idAlimento: true,
      quantidadeGramas: true,
      alimento: { select: { id: true, nome: true, nomeExibicao: true } },
    },
  });

  console.log('=== ITENS DO PLANO ===');
  for (const i of itens) {
    const medidas = await p.medidaCaseira.count({
      where: { alimentoId: i.idAlimento },
    });
    console.log(
      `item ${i.id} | alimento ${i.idAlimento} | ${i.quantidadeGramas}g | medidas: ${medidas} | "${i.alimento.nomeExibicao ?? i.alimento.nome}"`,
    );
  }

  console.log('\n=== TOTAL DE MEDIDAS NO BANCO ===');
  const totalMedidas = await p.medidaCaseira.count();
  const alimentosComMedida = await p.medidaCaseira.groupBy({
    by: ['alimentoId'],
    _count: true,
  });
  console.log('Medidas cadastradas:', totalMedidas);
  console.log('Alimentos com medida:', alimentosComMedida.length);

  console.log('\n=== AMOSTRA DE MEDIDAS ===');
  const amostra = await p.medidaCaseira.findMany({
    take: 20,
    orderBy: { alimentoId: 'asc' },
    select: {
      id: true,
      alimentoId: true,
      nome: true,
      gramas: true,
      padrao: true,
      alimento: { select: { nomeExibicao: true } },
    },
  });
  for (const m of amostra) {
    console.log(
      `alimento ${m.alimentoId} | "${m.alimento.nomeExibicao}" | ${m.nome} = ${Number(m.gramas)}g | padrao: ${m.padrao}`,
    );
  }

  await p.$disconnect();
}

main();