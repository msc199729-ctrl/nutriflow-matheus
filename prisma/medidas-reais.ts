import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const DRY_RUN = false;

/**
 * Mapa: nomeBusca do alimento → lista de medidas
 * A primeira medida da lista vira a padrão.
 */
const MEDIDAS: Record<string, Array<{ nome: string; gramas: number }>> = {
  'banana prata in natura musa': [
    { nome: 'Unidade média', gramas: 70 },
    { nome: 'Unidade grande', gramas: 100 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
  'banana nanica in natura musa': [
    { nome: 'Unidade média', gramas: 90 },
    { nome: 'Unidade grande', gramas: 120 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
  'maca com casca in natura malus': [
    { nome: 'Unidade média', gramas: 130 },
    { nome: 'Unidade grande', gramas: 180 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
  'pao frances com requeijao': [
    { nome: 'Unidade', gramas: 50 },
    { nome: 'Unidade grande', gramas: 75 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
  'pao frances trigo branco de padaria': [
    { nome: 'Unidade', gramas: 50 },
    { nome: 'Unidade grande', gramas: 75 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
  'pao de forma integral': [
    { nome: 'Fatia', gramas: 25 },
    { nome: 'Fatia grossa', gramas: 40 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
  'bebida cafe infusao 10% com acucar': [
    { nome: 'Xícara média', gramas: 100 },
    { nome: 'Xícara pequena', gramas: 50 },
    { nome: 'Copo', gramas: 200 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
  'arroz carreteiro sem sal': [
    { nome: 'Colher(es) de sopa cheia', gramas: 25 },
    { nome: 'Escumadeira cheia', gramas: 85 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
  'feijao preto cru phaseolus l': [
    { nome: 'Concha média', gramas: 80 },
    { nome: 'Colher(es) de sopa cheia', gramas: 20 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
  'carne frango moela cozida sem oleo com sal': [
    { nome: 'Filé médio', gramas: 75 },
    { nome: 'Colher(es) de sopa cheia', gramas: 30 },
    { nome: 'Gramas (g)', gramas: 1 },
  ],
};
async function main() {
  console.log('Alimentos no mapeamento:', Object.keys(MEDIDAS).length);

  let encontrados = 0;
  let naoEncontrados: string[] = [];

  for (const [nomeBusca, medidas] of Object.entries(MEDIDAS)) {
    const alimento = await p.baseAlimento.findFirst({
      where: { nomeBusca },
      select: { id: true, nomeExibicao: true, nomeBusca: true },
    });

    if (!alimento) {
      naoEncontrados.push(nomeBusca);
      continue;
    }

    encontrados++;
    console.log(`\n✅ ${alimento.nomeExibicao} (id ${alimento.id})`);

    for (let i = 0; i < medidas.length; i++) {
      const m = medidas[i];
      const padrao = i === 0;

      console.log(`   ${padrao ? '★' : ' '} ${m.nome} = ${m.gramas}g`);

      if (!DRY_RUN) {
        await p.medidaCaseira.upsert({
          where: {
            alimentoId_nome: {
              alimentoId: alimento.id,
              nome: m.nome,
            },
          },
          update: { gramas: m.gramas, padrao, ordem: i },
          create: {
            alimentoId: alimento.id,
            nome: m.nome,
            gramas: m.gramas,
            padrao,
            ordem: i,
          },
        });
      }
    }
  }

  console.log(`\nAlimentos encontrados: ${encontrados}`);
  if (naoEncontrados.length > 0) {
    console.log('Não encontrados:');
    naoEncontrados.forEach((n) => console.log('  -', n));
  }

  if (DRY_RUN) {
    console.log('\n=== DRY RUN === Troque DRY_RUN para false para gravar.');
  }

  await p.$disconnect();
}

main();