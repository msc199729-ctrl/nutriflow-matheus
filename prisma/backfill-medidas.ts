import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const DRY_RUN = false;

async function main() {
  const itens = await p.itemDieta.findMany({
    where: {
      quantidadeGramas: { not: null },
    },
    select: {
      id: true,
      idAlimento: true,
      quantidadeGramas: true,
      medidaCaseira: true,
    },
  });

  console.log(`Itens sem medida estruturada: ${itens.length}`);

  const medidas = await p.medidaCaseira.findMany({
    select: { id: true, alimentoId: true, gramas: true, nome: true, padrao: true },
  });

  const porAlimento = new Map<number, typeof medidas>();
  for (const m of medidas) {
    const lista = porAlimento.get(m.alimentoId) ?? [];
    lista.push(m);
    porAlimento.set(m.alimentoId, lista);
  }

  let preenchidos = 0;
  let semMedida = 0;

  for (const item of itens) {
  const lista = porAlimento.get(item.idAlimento) ?? [];
  const padrao = lista.find((m) => m.padrao) ?? lista[0];
  if (!padrao) { semMedida++; continue; }

  const gramasPorUnidade = Number(padrao.gramas);
  const quantidade = Number(
    ((item.quantidadeGramas ?? 0) / gramasPorUnidade).toFixed(2),
  );

  if (DRY_RUN) {
    if (preenchidos < 20) {
      console.log(
        `id ${item.id}: ${item.quantidadeGramas}g → ${quantidade} × ${padrao.nome} (${gramasPorUnidade}g)`,
      );
    }
  } else {
    await p.itemDieta.update({
      where: { id: item.id },
      data: { idMedidaCaseira: padrao.id, quantidadeMedida: quantidade },
    });
  }
  preenchidos++;
}

  console.log(`\nPreenchidos: ${preenchidos}`);
  console.log(`Sem medida disponível: ${semMedida}`);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN ===');
    console.log('Troque DRY_RUN para false para gravar.');
  }

  await p.$disconnect();
}

main();