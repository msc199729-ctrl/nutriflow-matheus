import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';

const url = process.env.DATABASE_URL
  ?? `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD ?? '')}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?schema=public`;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

// ===== CONFIG =====
const DRY_RUN = false; // ← true = só mostra | false = grava no banco
const LIMITE = 20;    // quantos registros processar no dry-run
// ==================

// Termos científicos/abreviações removíveis (LISTA FECHADA — não adivinhar)
const CIENTIFICOS = new Set([
  'gallus', 'gallus gallus', 'bos', 'bos taurus', 'sus', 'sus scrofa',
  'zea', 'zea mays', 'zea may', 'oryza', 'oryza sativa', 'lablab',
  'lablab purpureus', 'glycine', 'glycine max', 'phaseolus', 'brassica',
  'solanum', 'malus', 'musa', 'citrus', 'lactuca', 'daucus', 'allium',
  'capsicum', 'cucumis', 'cucurbita', 'ipomoea', 'manihot', 'saccharum',
  'coffea', 'theobroma', 'psidium', 'carica', 'passiflora', 'mangifera',
  'vitis', 'prunus', 'pyrus', 'fragaria', 'rubus', 'avena', 'triticum',
  'hordeum', 'secale', 'pennisetum', 'sorghum', 'cichla', 'oreochromis',
  'salmo', 'ocellaris', 'purpureus', 'sativa', 'sativum', 'domesticus',
  'taurus', 'scrofa', 'mays', 'may', 'spp', 'l', 'sweet', 'linn',
  'var', 'subsp', 'ssp',
]);

function removerCientificos(texto: string): string {
  const palavras = texto.split(' ');
  const resultado: string[] = [];
  let i = 0;

  while (i < palavras.length) {
    const atual = palavras[i].toLowerCase().replace(/\.$/, '');
    const proxima = palavras[i + 1]?.toLowerCase().replace(/\.$/, '');

    // tenta par (gênero + espécie)
    if (proxima && CIENTIFICOS.has(atual) && CIENTIFICOS.has(proxima)) {
      i += 2;
      continue;
    }

    // tenta termo isolado
    if (CIENTIFICOS.has(atual)) {
      i += 1;
      continue;
    }

    resultado.push(palavras[i]);
    i += 1;
  }

  return resultado.join(' ');
}

function limpar(nome: string) {
  let s = nome;

  // 1. remove parênteses ANINHADOS
  let antes;
  do {
    antes = s;
    s = s.replace(/\([^()]*\)/g, ' ');
  } while (s !== antes);
  s = s.replace(/\(.*$/, ' ');

  // 2. remove resíduos entre colchetes
  s = s.replace(/\[[^\]]*\]/g, ' ');

  // 3. c/ e s/ → legíveis
  s = s.replace(/\bc\//gi, 'com ');
  s = s.replace(/\bs\//gi, 'sem ');

  // 4. pontuação solta → espaço
  s = s.replace(/[,/;()]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // 5. remove termos científicos via LISTA FECHADA
  s = removerCientificos(s);

  // 6. colapsa espaços e limpa pontas
  s = s.replace(/\s+/g, ' ').replace(/[,;:\-\s]+$/, '').trim();

  // 7. remove preposição órfã no final
  s = s.replace(/\s+(com|sem|e|de|da|do)$/i, '').trim();

  // 8. capitaliza
  const exibicao = s.charAt(0).toUpperCase() + s.slice(1);

  // 9. versão busca
  const busca = exibicao
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  return { exibicao, busca };
}

async function main() {
  const todos = await prisma.baseAlimento.findMany({
    select: { id: true, nome: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Total no banco: ${todos.length}\n`);

  if (DRY_RUN) {
    console.log(`=== DRY RUN (${LIMITE} registros) — NÃO GRAVA ===\n`);
    for (const a of todos.slice(0, LIMITE)) {
      const { exibicao, busca } = limpar(a.nome);
      console.log(`ANTES:  ${a.nome}`);
      console.log(`DEPOIS: ${exibicao}`);
      console.log(`BUSCA:  ${busca}\n`);
    }
    console.log('Se estiver bom, troque DRY_RUN para false e rode de novo.');
    await prisma.$disconnect();
    return;
  }

  // modo gravação
  const arquivo = `backup-alimentos-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(arquivo, JSON.stringify(todos, null, 2));
  console.log(`✅ Backup: ${arquivo}\n`);

  let n = 0;
  for (const a of todos) {
    const { exibicao, busca } = limpar(a.nome);
    if (!exibicao) continue;
    await prisma.baseAlimento.update({
      where: { id: a.id },
      data: { nomeExibicao: exibicao, nomeBusca: busca },
    });
    n++;
    if (n % 500 === 0) console.log(`  ${n}/${todos.length}`);
  }

  console.log(`\n✅ ${n} alimentos normalizados.`);
  await prisma.$disconnect();
}

main();