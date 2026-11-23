import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

// ===== CONFIG =====
const DRY_RUN = false; // ← true = só mostra | false = grava
// ==================

type Medida = { nome: string; gramas: number; padrao?: boolean };

/** Medida universal "Gramas" — adicionada em todo alimento. */
const MEDIDA_GRAMAS: Medida = { nome: 'Gramas (g)', gramas: 1 };

const MEDIDAS: Record<string, Medida[]> = {
  // ===== PROTEÍNAS ANIMAIS =====
  'frango peito grelhado sem pele': [
    { nome: 'Filé médio', gramas: 100, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 25 },
    { nome: 'Posta grande', gramas: 150 },
  ],
  'frango peito cozido sem pele': [
    { nome: 'Filé médio', gramas: 100, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 25 },
    { nome: 'Posta grande', gramas: 150 },
  ],
  'frango coxa cozida sem pele': [
    { nome: 'Unidade média', gramas: 75, padrao: true },
    { nome: 'Unidade grande', gramas: 100 },
  ],
  'frango sobrecoxa assada sem pele': [
    { nome: 'Unidade média', gramas: 90, padrao: true },
    { nome: 'Unidade grande', gramas: 120 },
  ],
  'ovo de galinha cozido': [
    { nome: 'Unidade', gramas: 50, padrao: true },
    { nome: 'Unidade grande', gramas: 60 },
  ],
  'ovo de galinha frito': [
    { nome: 'Unidade', gramas: 50, padrao: true },
  ],
  'carne bovina patinho grelhado sem gordura': [
    { nome: 'Bife médio', gramas: 100, padrao: true },
    { nome: 'Bife grande', gramas: 150 },
    { nome: 'Colher(es) de sopa cheia', gramas: 25 },
  ],
  'carne bovina acem cozido sem gordura': [
    { nome: 'Pedaco médio', gramas: 80, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 25 },
  ],
  'carne suina lombo assado': [
    { nome: 'Fatia média', gramas: 80, padrao: true },
    { nome: 'Bife médio', gramas: 100 },
  ],
  'peixe tilapia grelhada': [
    { nome: 'Filé médio', gramas: 100, padrao: true },
    { nome: 'Filé grande', gramas: 150 },
  ],
  'peixe salmao grelhado': [
    { nome: 'Filé médio', gramas: 100, padrao: true },
    { nome: 'Posta média', gramas: 120 },
  ],
  'atum em agua drenado': [
    { nome: 'Colher(es) de sopa cheia', gramas: 25, padrao: true },
    { nome: 'Lata drenada', gramas: 120 },
  ],

  // ===== CARBOIDRATOS =====
  'arroz branco cozido': [
    { nome: 'Colher(es) de arroz cheia', gramas: 45, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 25 },
    { nome: 'Escumadeira cheia', gramas: 80 },
    { nome: 'Xicara de cha', gramas: 150 },
    { nome: 'Prato raso', gramas: 120 },
  ],
  'arroz integral cozido': [
    { nome: 'Colher(es) de arroz cheia', gramas: 45, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 25 },
    { nome: 'Escumadeira cheia', gramas: 80 },
    { nome: 'Xicara de cha', gramas: 150 },
  ],
  'feijao carioca cozido': [
    { nome: 'Concha média', gramas: 86, padrao: true },
    { nome: 'Concha grande', gramas: 110 },
    { nome: 'Colher(es) de sopa cheia', gramas: 20 },
    { nome: 'Colher(es) de sopa rasa', gramas: 15 },
  ],
  'feijao preto cozido': [
    { nome: 'Concha média', gramas: 86, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 20 },
  ],
  'lentilha cozida': [
    { nome: 'Colher(es) de sopa cheia', gramas: 22, padrao: true },
    { nome: 'Concha média', gramas: 86 },
  ],
  'batata doce cozida': [
    { nome: 'Unidade média', gramas: 130, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 30 },
    { nome: 'Fatia média', gramas: 60 },
  ],
  'batata inglesa cozida': [
    { nome: 'Unidade média', gramas: 110, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 30 },
  ],
  'mandioca cozida': [
    { nome: 'Pedaco médio', gramas: 80, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 30 },
  ],
  'macarrao cozido': [
    { nome: 'Colher(es) de sopa cheia', gramas: 25, padrao: true },
    { nome: 'Escumadeira cheia', gramas: 80 },
    { nome: 'Prato raso', gramas: 130 },
  ],
  'aveia em flocos': [
    { nome: 'Colher(es) de sopa cheia', gramas: 15, padrao: true },
    { nome: 'Colher(es) de sopa rasa', gramas: 10 },
    { nome: 'Xicara de cha', gramas: 80 },
  ],
  'pao frances': [
    { nome: 'Unidade', gramas: 50, padrao: true },
    { nome: 'Unidade grande', gramas: 70 },
  ],
  'pao de forma integral': [
    { nome: 'Fatia', gramas: 25, padrao: true },
    { nome: 'Fatia grossa', gramas: 35 },
  ],
  'tapioca': [
    { nome: 'Colher(es) de sopa cheia', gramas: 20, padrao: true },
    { nome: 'Unidade média', gramas: 80 },
  ],

  // ===== FRUTAS =====
  'banana prata': [
    { nome: 'Unidade', gramas: 70, padrao: true },
    { nome: 'Unidade média', gramas: 90 },
    { nome: 'Unidade grande', gramas: 110 },
  ],
  'banana nanica': [
    { nome: 'Unidade', gramas: 100, padrao: true },
    { nome: 'Unidade grande', gramas: 130 },
  ],
  'maca com casca': [
    { nome: 'Unidade média', gramas: 130, padrao: true },
    { nome: 'Unidade grande', gramas: 170 },
  ],
  'mamao papaia': [
    { nome: 'Fatia média', gramas: 100, padrao: true },
    { nome: 'Metade da fruta', gramas: 150 },
  ],
  'laranja pera': [
    { nome: 'Unidade média', gramas: 130, padrao: true },
    { nome: 'Unidade grande', gramas: 180 },
  ],
  'morango': [
    { nome: 'Unidade', gramas: 12, padrao: true },
    { nome: 'Xicara de cha', gramas: 150 },
  ],

  // ===== LATICÍNIOS =====
  'leite de vaca integral': [
    { nome: 'Copo americano', gramas: 200, padrao: true },
    { nome: 'Xicara de cha', gramas: 240 },
    { nome: 'Colher(es) de sopa cheia', gramas: 15 },
  ],
  'leite de vaca desnatado': [
    { nome: 'Copo americano', gramas: 200, padrao: true },
    { nome: 'Xicara de cha', gramas: 240 },
  ],
  'iogurte natural integral': [
    { nome: 'Pote', gramas: 170, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 20 },
  ],
  'queijo minas frescal': [
    { nome: 'Fatia média', gramas: 30, padrao: true },
    { nome: 'Colher(es) de sopa cheia', gramas: 25 },
  ],
  'queijo mucarela': [
    { nome: 'Fatia', gramas: 20, padrao: true },
    { nome: 'Fatia grossa', gramas: 30 },
  ],

  // ===== GORDURAS E OLEAGINOSAS =====
  'azeite de oliva extra virgem': [
    { nome: 'Colher(es) de sopa', gramas: 13, padrao: true },
    { nome: 'Colher(es) de cha', gramas: 4 },
    { nome: 'Fio', gramas: 3 },
  ],
  'oleo de soja': [
    { nome: 'Colher(es) de sopa', gramas: 13, padrao: true },
    { nome: 'Colher(es) de cha', gramas: 4 },
  ],
  'manteiga com sal': [
    { nome: 'Colher(es) de cha', gramas: 5, padrao: true },
    { nome: 'Colher(es) de sopa', gramas: 15 },
    { nome: 'Ponta de faca', gramas: 3 },
  ],
  'pasta de amendoim integral': [
    { nome: 'Colher(es) de sopa cheia', gramas: 15, padrao: true },
  ],
  'castanha do para': [
    { nome: 'Unidade', gramas: 5, padrao: true },
    { nome: 'Colher(es) de sopa', gramas: 20 },
  ],
  'amendoa': [
    { nome: 'Unidade', gramas: 1.2, padrao: true },
    { nome: 'Colher(es) de sopa', gramas: 15 },
  ],

  // ===== LEGUMES E VERDURAS =====
  'brocolis cozido': [
    { nome: 'Colher(es) de sopa cheia', gramas: 25, padrao: true },
    { nome: 'Xicara de cha', gramas: 90 },
  ],
  'tomate cru': [
    { nome: 'Fatia média', gramas: 20, padrao: true },
    { nome: 'Unidade média', gramas: 120 },
  ],
  'cenoura crua': [
    { nome: 'Unidade média', gramas: 90, padrao: true },
    { nome: 'Colher(es) de sopa ralada', gramas: 15 },
  ],
  'alface crespa': [
    { nome: 'Folha', gramas: 10, padrao: true },
    { nome: 'Prato raso', gramas: 40 },
  ],
};

async function main() {
  const entradas = Object.entries(MEDIDAS);
  console.log(`Alimentos com medidas mapeadas: ${entradas.length}\n`);

  if (DRY_RUN) console.log('=== DRY RUN — NÃO GRAVA ===\n');

  let criados = 0;
  let ignorados = 0;
  const semAlimento: string[] = [];

  for (const [nomeBusca, medidas] of entradas) {
    const alimento = await prisma.baseAlimento.findFirst({
      where: { nomeBusca },
      select: { id: true, nome: true },
    });

    if (!alimento) {
      semAlimento.push(nomeBusca);
      console.log(`❌ Não encontrado: ${nomeBusca}`);
      continue;
    }

    const medidasCompletas = [...medidas, MEDIDA_GRAMAS];

    if (DRY_RUN) {
      console.log(`✅ ${alimento.nome}`);
      for (const m of medidasCompletas) {
        const pad = m.padrao ? ' ★' : '';
        console.log(`     • ${m.nome} = ${m.gramas}g${pad}`);
      }
      continue;
    }

    for (let i = 0; i < medidasCompletas.length; i++) {
      const m = medidasCompletas[i];

      const existe = await prisma.medidaCaseira.findFirst({
        where: { alimentoId: alimento.id, nome: m.nome },
      });

      if (existe) {
        ignorados++;
        continue;
      }

      await prisma.medidaCaseira.create({
        data: {
          alimentoId: alimento.id,
          nome: m.nome,
          gramas: m.gramas,
          ordem: i,
          padrao: m.padrao ?? false,
        },
      });
      criados++;
    }

    console.log(`✅ ${alimento.nome} — ${medidasCompletas.length} medidas`);
  }

  if (DRY_RUN) {
    console.log('\n=== Fim do dry run ===');
    if (semAlimento.length) {
      console.log(`\n⚠️  ${semAlimento.length} sem correspondência:`);
      semAlimento.forEach((n) => console.log(`   - ${n}`));
    }
    console.log('\nSe estiver bom, troque DRY_RUN para false.');
  } else {
    console.log(`\n✅ ${criados} medidas criadas, ${ignorados} já existiam.`);
  }

  await prisma.$disconnect();
}

main();