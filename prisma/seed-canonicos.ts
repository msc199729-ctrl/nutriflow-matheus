import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});
// ===== CONFIG =====
const DRY_RUN = false; // ← true = só mostra | false = grava
// ==================

type Canonico = {
  nome: string;       // nome completo de exibição
  categoria: string;
  kcal: number;
  p: number;          // proteína g/100g
  c: number;          // carboidrato g/100g
  g: number;          // gordura g/100g
  fibra: number;
  sodio: number;      // mg/100g
};

/**
 * Valores por 100g — referência TACO (Tabela Brasileira de Composição
 * de Alimentos, 4ª ed.) e USDA para itens ausentes na TACO.
 * Estes são os alimentos "básicos" que faltam na base TACO/TBCA e que
 * aparecem com mais frequência em planos alimentares clínicos.
 */
const CANONICOS: Canonico[] = [
  // ===== PROTEÍNAS ANIMAIS =====
  { nome: 'Frango peito grelhado sem pele', categoria: 'Carnes e derivados', kcal: 159, p: 32.0, c: 0, g: 2.5, fibra: 0, sodio: 52 },
  { nome: 'Frango peito cozido sem pele', categoria: 'Carnes e derivados', kcal: 163, p: 31.5, c: 0, g: 3.2, fibra: 0, sodio: 45 },
  { nome: 'Frango coxa cozida sem pele', categoria: 'Carnes e derivados', kcal: 167, p: 26.9, c: 0, g: 6.9, fibra: 0, sodio: 75 },
  { nome: 'Frango sobrecoxa assada sem pele', categoria: 'Carnes e derivados', kcal: 187, p: 26.0, c: 0, g: 9.1, fibra: 0, sodio: 82 },
  { nome: 'Ovo de galinha cozido', categoria: 'Ovos e derivados', kcal: 146, p: 13.3, c: 0.6, g: 9.5, fibra: 0, sodio: 146 },
  { nome: 'Ovo de galinha frito', categoria: 'Ovos e derivados', kcal: 240, p: 15.6, c: 0.6, g: 18.6, fibra: 0, sodio: 165 },
  { nome: 'Carne bovina patinho grelhado sem gordura', categoria: 'Carnes e derivados', kcal: 219, p: 35.9, c: 0, g: 7.3, fibra: 0, sodio: 60 },
  { nome: 'Carne bovina acém cozido sem gordura', categoria: 'Carnes e derivados', kcal: 212, p: 26.7, c: 0, g: 10.9, fibra: 0, sodio: 55 },
  { nome: 'Carne suína lombo assado', categoria: 'Carnes e derivados', kcal: 210, p: 35.7, c: 0, g: 6.4, fibra: 0, sodio: 58 },
  { nome: 'Peixe tilápia grelhada', categoria: 'Pescados', kcal: 128, p: 26.2, c: 0, g: 2.7, fibra: 0, sodio: 52 },
  { nome: 'Peixe salmão grelhado', categoria: 'Pescados', kcal: 243, p: 26.5, c: 0, g: 14.5, fibra: 0, sodio: 55 },
  { nome: 'Atum em água drenado', categoria: 'Pescados', kcal: 116, p: 25.7, c: 0, g: 0.8, fibra: 0, sodio: 287 },

  // ===== CARBOIDRATOS =====
  { nome: 'Arroz branco cozido', categoria: 'Cereais e derivados', kcal: 128, p: 2.5, c: 28.1, g: 0.2, fibra: 1.6, sodio: 1 },
  { nome: 'Arroz integral cozido', categoria: 'Cereais e derivados', kcal: 124, p: 2.6, c: 25.8, g: 1.0, fibra: 2.7, sodio: 5 },
  { nome: 'Feijão carioca cozido', categoria: 'Leguminosas', kcal: 76, p: 4.8, c: 13.6, g: 0.5, fibra: 8.5, sodio: 2 },
  { nome: 'Feijão preto cozido', categoria: 'Leguminosas', kcal: 77, p: 4.5, c: 14.0, g: 0.5, fibra: 8.4, sodio: 2 },
  { nome: 'Lentilha cozida', categoria: 'Leguminosas', kcal: 93, p: 6.3, c: 16.3, g: 0.5, fibra: 7.9, sodio: 2 },
  { nome: 'Batata doce cozida', categoria: 'Tubérculos', kcal: 77, p: 0.6, c: 18.4, g: 0.1, fibra: 2.2, sodio: 17 },
  { nome: 'Batata inglesa cozida', categoria: 'Tubérculos', kcal: 52, p: 1.2, c: 11.9, g: 0.1, fibra: 1.3, sodio: 2 },
  { nome: 'Mandioca cozida', categoria: 'Tubérculos', kcal: 125, p: 0.6, c: 30.1, g: 0.3, fibra: 1.6, sodio: 2 },
  { nome: 'Macarrão cozido', categoria: 'Cereais e derivados', kcal: 102, p: 3.3, c: 19.9, g: 1.0, fibra: 1.6, sodio: 3 },
  { nome: 'Aveia em flocos', categoria: 'Cereais e derivados', kcal: 394, p: 13.9, c: 66.6, g: 8.5, fibra: 9.1, sodio: 5 },
  { nome: 'Pão francês', categoria: 'Cereais e derivados', kcal: 300, p: 8.0, c: 58.6, g: 3.1, fibra: 2.3, sodio: 648 },
  { nome: 'Pão de forma integral', categoria: 'Cereais e derivados', kcal: 253, p: 9.4, c: 49.9, g: 3.7, fibra: 6.9, sodio: 506 },
  { nome: 'Tapioca', categoria: 'Cereais e derivados', kcal: 240, p: 0.1, c: 59.5, g: 0.0, fibra: 0.4, sodio: 1 },

  // ===== FRUTAS =====
  { nome: 'Banana prata', categoria: 'Frutas', kcal: 98, p: 1.3, c: 26.0, g: 0.1, fibra: 2.0, sodio: 1 },
  { nome: 'Banana nanica', categoria: 'Frutas', kcal: 92, p: 1.4, c: 23.8, g: 0.1, fibra: 1.9, sodio: 1 },
  { nome: 'Maçã com casca', categoria: 'Frutas', kcal: 56, p: 0.3, c: 15.2, g: 0.2, fibra: 1.3, sodio: 1 },
  { nome: 'Mamão papaia', categoria: 'Frutas', kcal: 40, p: 0.5, c: 10.4, g: 0.1, fibra: 1.0, sodio: 3 },
  { nome: 'Laranja pera', categoria: 'Frutas', kcal: 37, p: 1.0, c: 8.9, g: 0.1, fibra: 0.8, sodio: 0 },
  { nome: 'Morango', categoria: 'Frutas', kcal: 30, p: 0.9, c: 6.8, g: 0.3, fibra: 1.7, sodio: 1 },

  // ===== LATICÍNIOS =====
  { nome: 'Leite de vaca integral', categoria: 'Leite e derivados', kcal: 61, p: 2.9, c: 4.3, g: 3.2, fibra: 0, sodio: 46 },
  { nome: 'Leite de vaca desnatado', categoria: 'Leite e derivados', kcal: 35, p: 3.0, c: 5.0, g: 0.2, fibra: 0, sodio: 51 },
  { nome: 'Iogurte natural integral', categoria: 'Leite e derivados', kcal: 51, p: 4.1, c: 1.9, g: 3.0, fibra: 0, sodio: 52 },
  { nome: 'Queijo minas frescal', categoria: 'Leite e derivados', kcal: 264, p: 17.4, c: 3.2, g: 20.2, fibra: 0, sodio: 32 },
  { nome: 'Queijo muçarela', categoria: 'Leite e derivados', kcal: 330, p: 22.6, c: 3.0, g: 25.2, fibra: 0, sodio: 580 },

  // ===== GORDURAS E OLEAGINOSAS =====
  { nome: 'Azeite de oliva extra virgem', categoria: 'Óleos e gorduras', kcal: 884, p: 0, c: 0, g: 100.0, fibra: 0, sodio: 0 },
  { nome: 'Óleo de soja', categoria: 'Óleos e gorduras', kcal: 884, p: 0, c: 0, g: 100.0, fibra: 0, sodio: 0 },
  { nome: 'Manteiga com sal', categoria: 'Óleos e gorduras', kcal: 726, p: 0.4, c: 0.1, g: 82.4, fibra: 0, sodio: 579 },
  { nome: 'Pasta de amendoim integral', categoria: 'Oleaginosas', kcal: 588, p: 25.1, c: 20.0, g: 50.0, fibra: 8.0, sodio: 17 },
  { nome: 'Castanha do Pará', categoria: 'Oleaginosas', kcal: 643, p: 14.5, c: 15.1, g: 63.5, fibra: 7.9, sodio: 3 },
  { nome: 'Amêndoa', categoria: 'Oleaginosas', kcal: 581, p: 21.3, c: 21.7, g: 50.6, fibra: 12.5, sodio: 1 },

  // ===== LEGUMES E VERDURAS =====
  { nome: 'Brócolis cozido', categoria: 'Verduras', kcal: 25, p: 2.1, c: 4.4, g: 0.5, fibra: 3.4, sodio: 3 },
  { nome: 'Tomate cru', categoria: 'Legumes', kcal: 15, p: 1.1, c: 3.1, g: 0.2, fibra: 1.2, sodio: 1 },
  { nome: 'Cenoura crua', categoria: 'Legumes', kcal: 34, p: 1.3, c: 7.7, g: 0.2, fibra: 3.2, sodio: 3 },
  { nome: 'Alface crespa', categoria: 'Verduras', kcal: 11, p: 1.3, c: 1.7, g: 0.2, fibra: 1.8, sodio: 7 },
];

/** Normaliza nome para busca (minúsculo, sem acento). */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log(`Total de canônicos a processar: ${CANONICOS.length}\n`);

  if (DRY_RUN) {
    console.log('=== DRY RUN — NÃO GRAVA ===\n');
    for (const c of CANONICOS) {
      const existe = await prisma.baseAlimento.findFirst({
        where: { nomeBusca: normalizar(c.nome) },
      });
      const status = existe ? '⚠️  JÁ EXISTE' : '✅ novo';
      console.log(`${status} | ${c.nome}`);
      console.log(`         ${c.kcal} kcal | P${c.p} C${c.c} G${c.g}`);
    }
    console.log('\nSe estiver bom, troque DRY_RUN para false.');
    await prisma.$disconnect();
    return;
  }

  // ===== GRAVAÇÃO =====
  let criados = 0;
  let ignorados = 0;

  for (const c of CANONICOS) {
    const nomeBusca = normalizar(c.nome);

    const existe = await prisma.baseAlimento.findFirst({
      where: { nomeBusca },
    });

    if (existe) {
      console.log(`⚠️  Ignorado (já existe): ${c.nome}`);
      ignorados++;
      continue;
    }

    await prisma.baseAlimento.create({
      data: {
        nome: c.nome,
        nomeExibicao: c.nome.charAt(0).toUpperCase() + c.nome.slice(1),
        nomeBusca,
        fonte: 'canonico',
        calorias: c.kcal,
        proteinas: c.p,
        carboidratos: c.c,
        gorduras: c.g,
        fibras: c.fibra,
        sodio: c.sodio,
        ehUltraprocessado: false,
      },
    });

    console.log(`✅ Criado: ${c.nome}`);
    criados++;
  }

  console.log(`\n✅ ${criados} canônicos criados, ${ignorados} já existiam.`);
  await prisma.$disconnect();
}

main();