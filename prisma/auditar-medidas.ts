import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

/**
 * Alimentos que VOCÊ validou no ONutri.
 * Preencha os IDs assim que rodar o script pela primeira vez (a saída mostra o id).
 */
const CALIBRADOS = new Set<number>([
  5426, 4870, 5659, 276, 785, 4360, 11424, 11421, 3359, 4287,
]);

async function main() {
  const alimentos = await p.baseAlimento.findMany({
    where: { medidasCaseiras: { some: {} } },
    select: {
      id: true,
      nome: true,
      nomeExibicao: true,
      medidasCaseiras: {
        orderBy: { ordem: 'asc' },
        select: { nome: true, gramas: true, padrao: true },
      },
    },
    orderBy: { nome: 'asc' },
  });

  console.log(`\n=== CATÁLOGO ===`);
  console.log(`Total com medida cadastrada: ${alimentos.length}`);
  console.log(`Validados no ONutri: ${CALIBRADOS.size}`);
  console.log(`⚠️  Pendentes de validação: ${alimentos.length - CALIBRADOS.size}\n`);

  for (const a of alimentos) {
    const status = CALIBRADOS.has(a.id) ? '✅' : '⚠️ ';
    console.log(`${status} ${a.nomeExibicao ?? a.nome} (id ${a.id})`);
    const medidas = a.medidasCaseiras
      .map((m) => `${m.padrao ? '★' : ' '} ${m.nome}=${m.gramas}g`)
      .join(' | ');
    console.log(`     ${medidas}\n`);
  }

  await p.$disconnect();
}

main();