import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const ALIMENTOS_ALVO = [
  'banana prata in natura musa',
  'banana nanica in natura musa',
  'maca com casca in natura malus',
  'pao frances com requeijao',
  'pao frances trigo branco de padaria',
  'pao de forma integral',
  'bebida cafe infusao 10% com acucar',
  'arroz carreteiro sem sal',
  'feijao preto cru phaseolus l',
  'carne frango moela cozida sem oleo com sal',
];

async function main() {
  console.log('=== ESTADO REAL NO BANCO ===\n');

  for (const nomeBusca of ALIMENTOS_ALVO) {
    const alimento = await p.baseAlimento.findFirst({
      where: { nomeBusca },
      select: { id: true, nomeExibicao: true },
    });

    if (!alimento) {
      console.log(`❌ não achou: ${nomeBusca}`);
      continue;
    }

    const medidas = await p.medidaCaseira.findMany({
      where: { alimentoId: alimento.id },
      orderBy: [{ padrao: 'desc' }, { ordem: 'asc' }],
      select: { nome: true, gramas: true, padrao: true },
    });

    if (medidas.length === 0) {
      console.log(`⚠️  ${alimento.nomeExibicao} (${alimento.id}) → ZERO medidas no banco`);
    } else {
      console.log(`✅ ${alimento.nomeExibicao} (${alimento.id}) → ${medidas.length} medidas`);
      medidas.forEach((m) =>
        console.log(`     ${m.padrao ? '★' : ' '} ${m.nome} = ${Number(m.gramas)}g`),
      );
    }
  }

  const total = await p.medidaCaseira.count();
  console.log(`\nTotal de medidas no banco: ${total}`);
  const porAlimento = await p.medidaCaseira.groupBy({ by: ['alimentoId'], _count: true });
  console.log(`Alimentos com medida: ${porAlimento.length}`);

  await p.$disconnect();
}

main();