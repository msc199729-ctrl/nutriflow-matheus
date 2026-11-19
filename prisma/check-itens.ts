import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

async function main() {
  const total = await p.itemDieta.count();
  const comGrupo = await p.itemDieta.count({ where: { idGrupoSubstituicao: { not: null } } });
  const comMedidaTexto = await p.itemDieta.count({ where: { medidaCaseira: { not: null } } });
  const comGramas = await p.itemDieta.count({ where: { quantidadeGramas: { not: null } } });

  console.log('Total de itens:', total);
  console.log('Com grupo de substituição:', comGrupo);
  console.log('Com medidaCaseira (texto):', comMedidaTexto);
  console.log('Com quantidadeGramas:', comGramas);

  await p.$disconnect();
}

main();