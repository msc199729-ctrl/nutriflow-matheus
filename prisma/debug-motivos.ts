// prisma\debug-motivos.ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const contagem: Record<string, number> = {};

async function main() {
  const todos = await prisma.baseAlimento.findMany({ select: { nome: true } });

  for (const a of todos) {
    const nome = a.nome;
    if (/,\s*,/.test(nome) || /^,|,$/.test(nome)) contagem.virgulas = (contagem.virgulas ?? 0) + 1;
    if (/\(/.test(nome) || /\)/.test(nome)) contagem.parenteses = (contagem.parenteses ?? 0) + 1;
    if (/\[|\]/.test(nome)) contagem.colchetes = (contagem.colchetes ?? 0) + 1;
    if (/\bc\//i.test(nome) || /\bs\//i.test(nome)) contagem.abreviacao = (contagem.abreviacao ?? 0) + 1;
    if (/media de diferentes|media das amostras|valores medios/i.test(nome)) contagem.amostra = (contagem.amostra ?? 0) + 1;
  }

  console.log('Total:', todos.length);
  console.table(contagem);
  await prisma.$disconnect();
}

main();