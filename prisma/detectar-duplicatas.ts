import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

/** Normaliza nome para agrupar duplicatas (remove acentos, sufixos botânicos). */
function normalizar(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/in natura \w+/gi, '')
    .replace(/phaseolus l/gi, '')
    .replace(/malus/gi, '')
    .replace(/trigo branco/gi, '')
    .replace(/de padaria/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const alimentos = await p.baseAlimento.findMany({
    where: { medidasCaseiras: { some: {} } },
    select: {
      id: true,
      nome: true,
      nomeExibicao: true,
      _count: { select: { itensDieta: true } },
    },
  });

  const grupos = new Map<string, typeof alimentos>();
  for (const a of alimentos) {
    const chave = normalizar(a.nomeExibicao ?? a.nome);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(a);
  }

  console.log('=== DUPLICATAS DETECTADAS ===\n');

  let total = 0;
  for (const [chave, lista] of grupos) {
    if (lista.length < 2) continue;
    total++;
    console.log(`⚠️  "${chave}" → ${lista.length} registros:`);
    for (const a of lista) {
      const uso = a._count.itensDieta;
      const marcador = uso > 0 ? `[USADO em ${uso} itens]` : '[livre]';
      console.log(`   id ${a.id} — "${a.nomeExibicao ?? a.nome}" ${marcador}`);
    }
    console.log('');
  }

  console.log(`Total de grupos duplicados: ${total}`);

  await p.$disconnect();
}

main();