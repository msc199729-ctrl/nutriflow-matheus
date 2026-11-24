/**
 * Preenche os micronutrientes do Whey Protein Concentrado a partir do USDA
 * FoodData Central (fdcId 173180, "Beverages, Protein powder whey based",
 * SR Legacy) — a TBCA não cobre suplementos e os rótulos brasileiros
 * (Max Titanium, Dux, Growth, Integralmédica) só trazem macros + sódio.
 *
 * Uso (na raiz do backend):
 *   npx tsx prisma/scripts/preencher-whey-usda.ts            # relatório (nada grava)
 *   npx tsx prisma/scripts/preencher-whey-usda.ts --aplicar  # grava
 *
 * Por que USDA: é a base com micronutrientes completos para whey concentrate
 * (23/23 campos). As marcas BR não publicam micros; o concentrado delas é
 * quimicamente o mesmo produto (WPC ~80%), então os valores do USDA servem
 * como referência de base — com a ressalva registrada no campo `fonte`.
 *
 * Também DEDUPLICA: o banco tem 4 registros "Whey protein concentrado".
 * Mantém o mais antigo (o que os planos referenciam) e desativa os outros 3
 * (marca = "DUPLICADO - consolidar", para achar na UI).
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function getDatasourceUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const user = process.env.DB_USER ?? 'postgres';
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const name = process.env.DB_NAME ?? 'nutriflow';
  return `postgresql://${user}:${password}@${host}:${port}/${name}?schema=public`;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: getDatasourceUrl() }) });

/**
 * USDA FDC 173180 — Beverages, Protein powder whey based (SR Legacy, 2019).
 * Valores por 100 g. Verificação: soma dos ácidos graxos (1,24 g) < lipídios
 * totais (~2 g); todos os 23 abaixo dos tetos de sanidade do importador.
 * https://fdc.nal.usda.gov/fdc-app.html#/food-details/173180/nutrients
 */
const WHEY_USDA = {
  calcio: 469.0,            // mg — coerente com WPC 500-700 mg (USDEC, tabela 6.7.1)
  ferro: 1.13,              // mg
  magnesio: 195.0,          // mg
  fosforo: 1321.0,          // mg
  potassio: 500.0,          // mg
  zinco: 6.18,              // mg
  cobre: 0.049,             // mg
  selenio: 26.7,            // mcg
  vitaminaARae: 0.0,        // mcg — whey não tem vitamina A
  vitaminaC: 0.0,           // mg
  vitaminaD: 0.0,           // mcg
  vitaminaE: 0.0,           // mg
  tiamina: 0.609,           // mg
  vitaminaB2: 2.017,        // mg — riboflavina do soro de leite, alta mesmo
  vitaminaB3: 1.136,        // mg
  vitaminaB6: 0.607,        // mg
  vitaminaB12: 2.45,        // mcg
  folato: 33.0,             // mcg
  gorduraSaturada: 0.781,   // g
  gorduraMonoinsaturada: 0.158, // g
  gorduraPoliinsaturada: 0.299, // g
  gorduraTrans: 0.0,        // g
  colesterol: 16.0,         // mg
} as const;

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  console.log(aplicar ? 'MODO APLICAR (vai gravar)' : 'MODO RELATÓRIO (nada grava)');

  const registros = await prisma.baseAlimento.findMany({
    where: {
      OR: [
        { nome: { contains: 'whey', mode: 'insensitive' } },
        { nomeExibicao: { contains: 'whey', mode: 'insensitive' } },
      ],
    },
    orderBy: { id: 'asc' },
    select: {
      id: true, nome: true, nomeExibicao: true, marca: true, fonte: true,
      codigoTbca: true, classeTbca: true, createdAt: true,
      calcio: true,
    },
  });

  if (registros.length === 0) {
    console.log('Nenhum registro de whey encontrado.');
    return;
  }

  console.log(`\nRegistros de whey no banco: ${registros.length}`);
  for (const r of registros) {
    console.log(
      `  #${r.id} ${(r.nomeExibicao || r.nome).padEnd(40)} marca=${r.marca ?? '—'}` +
      ` fonte=${r.fonte ?? '—'} calcio=${r.calcio ?? 'null'}`,
    );
  }

  // Dedup: mesmo nome normalizado -> mantém o de menor id (o mais antigo,
  // que os planos referenciam), marca os demais.
  const porNome = new Map<string, typeof registros>();
  for (const r of registros) {
    const chave = (r.nomeExibicao || r.nome).toLowerCase().trim();
    const lista = porNome.get(chave) ?? [];
    lista.push(r);
    porNome.set(chave, lista);
  }

  const duplicados: number[] = [];
  for (const lista of porNome.values()) {
    if (lista.length > 1) {
      for (const r of lista.slice(1)) duplicados.push(r.id);
    }
  }
  console.log(`\nDuplicados a marcar: ${duplicados.length} -> ids ${duplicados.join(', ') || '—'}`);

  if (!aplicar) {
    console.log('\nValores que seriam gravados (por 100 g, USDA FDC 173180):');
    for (const [campo, v] of Object.entries(WHEY_USDA)) {
      console.log(`  ${campo.padEnd(22)} ${v}`);
    }
    console.log('\nPara gravar: npx tsx prisma/scripts/preencher-whey-usda.ts --aplicar');
    return;
  }

  // 1. Preencher TODOS os registros de whey sem micro (o plano pode apontar
  //    para qualquer um deles).
  let preenchidos = 0;
  for (const r of registros) {
    if (r.calcio !== null) continue; // já tem dado, não sobrescreve
    await prisma.baseAlimento.update({
      where: { id: r.id },
      data: { ...WHEY_USDA, fonte: 'USDA FDC 173180 (SR Legacy) — whey concentrate' },
    });
    preenchidos += 1;
  }
  console.log(`\nPreenchidos: ${preenchidos} registros.`);

  // 2. Marcar duplicados (só se nenhum estiver em uso por itens de dieta).
  if (duplicados.length > 0) {
    const emUso = await prisma.itemDieta.count({
      where: { idAlimento: { in: duplicados } },
    });
    console.log(`Duplicados referenciados por itens de dieta: ${emUso}`);
    if (emUso === 0) {
      await prisma.baseAlimento.updateMany({
        where: { id: { in: duplicados } },
        data: { marca: 'DUPLICADO - consolidar' },
      });
      console.log('Duplicados marcados com marca="DUPLICADO - consolidar".');
    } else {
      console.log('Há itens de dieta apontando para duplicados — NÃO marquei nada.');
      console.log('Me manda essa saída que eu faço a consolidação com remapeamento.');
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
