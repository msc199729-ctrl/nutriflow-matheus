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
 * Mantém o mais antigo (o que os planos referenciam) e marca os outros 3.
 *
 * NOTA DE SCHEMA: o model BaseAlimento NÃO possui colunas de timestamp
 * (createdAt / criadoEm / atualizadoEm). Nunca incluir essas chaves no
 * `select` — o Prisma Client rejeita com TS2353.
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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatasourceUrl() }),
});

/**
 * USDA FDC 173180 — Beverages, Protein powder whey based (SR Legacy, 2019).
 * Valores por 100 g.
 * https://fdc.nal.usda.gov/fdc-app.html#/food-details/173180/nutrients
 */
const WHEY_USDA = {
  calcio: 469.0,                // mg
  ferro: 1.13,                  // mg
  magnesio: 195.0,              // mg
  fosforo: 1321.0,              // mg
  potassio: 500.0,              // mg
  zinco: 6.18,                  // mg
  cobre: 0.049,                 // mg
  selenio: 26.7,                // mcg
  vitaminaARae: 0.0,            // mcg
  vitaminaC: 0.0,               // mg
  vitaminaD: 0.0,               // mcg
  vitaminaE: 0.0,               // mg
  tiamina: 0.609,               // mg
  vitaminaB2: 2.017,            // mg
  vitaminaB3: 1.136,            // mg
  vitaminaB6: 0.607,            // mg
  vitaminaB12: 2.45,            // mcg
  folato: 33.0,                 // mcg
  gorduraSaturada: 0.781,       // g
  gorduraMonoinsaturada: 0.158, // g
  gorduraPoliinsaturada: 0.299, // g
  gorduraTrans: 0.0,            // g
  colesterol: 16.0,             // mg
} as const;

const SOMA_ACIDOS_GRAXOS =
  WHEY_USDA.gorduraSaturada +
  WHEY_USDA.gorduraMonoinsaturada +
  WHEY_USDA.gorduraPoliinsaturada;

const FONTE_USDA = 'USDA FDC 173180 (SR Legacy) — whey concentrate';
const MARCA_DUPLICADO = 'DUPLICADO - consolidar';

/** Detecta marca já sinalizada, seja pelo fallback ou pelo sufixo. */
function jaMarcado(marca: string | null | undefined): boolean {
  return /duplicado/i.test(marca ?? '');
}

/**
 * Acrescenta o marcador sem destruir o valor original e sem duplicar.
 * Idempotente: rodar N vezes produz o mesmo resultado.
 */
function marcaComSelo(original: string | null | undefined): string {
  const base = (original ?? '').trim();
  if (!base) return MARCA_DUPLICADO;
  if (jaMarcado(base)) return base; // já selado, não toca
  return `${base} [DUPLICADO]`;
}

/** Fonte acumulativa: preserva a origem anterior em vez de sobrescrever. */
function fonteAcumulada(original: string | null | undefined): string {
  const base = (original ?? '').trim();
  if (!base) return FONTE_USDA;
  if (base.includes(FONTE_USDA)) return base; // já aplicado
  return `${base} | ${FONTE_USDA}`;
}

interface RegistroWhey {
  id: number;
  nome: string;
  nomeExibicao: string | null;
  marca: string | null;
  fonte: string | null;
  calcio: number | null;
  gorduras: number | null;
  proteinas: number | null;
  calorias: number | null;
}

async function contarUso(ids: number[]): Promise<Map<number, number>> {
  const pares = await Promise.all(
    ids.map(async (id) => {
      const itens = await prisma.itemDieta.count({ where: { idAlimento: id } });
      return [id, itens] as const;
    }),
  );
  return new Map(pares);
}

/**
 * Coerência física: a soma dos ácidos graxos não pode exceder a gordura total
 * declarada no registro. Se exceder, o registro tem macro incompatível com o
 * perfil USDA e gravar os micros criaria um dado impossível.
 */
function validarCoerencia(registros: RegistroWhey[]): RegistroWhey[] {
  const invalidos: RegistroWhey[] = [];
  for (const r of registros) {
    if (r.gorduras == null) continue; // sem macro, nada a comparar
    if (SOMA_ACIDOS_GRAXOS > r.gorduras + 0.05) {
      invalidos.push(r);
    }
  }
  return invalidos;
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  console.log(
    aplicar ? 'MODO APLICAR (vai gravar)' : 'MODO RELATÓRIO (nada grava)',
  );

  const registros: RegistroWhey[] = await prisma.baseAlimento.findMany({
    where: {
      OR: [
        { nome: { contains: 'whey', mode: 'insensitive' } },
        { nomeExibicao: { contains: 'whey', mode: 'insensitive' } },
      ],
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      nome: true,
      nomeExibicao: true,
      marca: true,
      fonte: true,
      calcio: true,
      gorduras: true,
      proteinas: true,
      calorias: true,
    },
  });

  if (registros.length === 0) {
    console.log('Nenhum registro de whey encontrado.');
    return;
  }

  const uso = await contarUso(registros.map((r) => r.id));

  console.log(`\nRegistros de whey no banco: ${registros.length}`);
  for (const r of registros) {
    const rotulo = (r.nomeExibicao || r.nome).padEnd(36);
    console.log(
      `  #${String(r.id).padStart(6)} ${rotulo}` +
        ` micros=${(r.calcio === null ? 'vazio' : 'ok').padEnd(6)}` +
        ` kcal=${String(r.calorias ?? '—').padStart(5)}` +
        ` P=${String(r.proteinas ?? '—').padStart(5)}` +
        ` G=${String(r.gorduras ?? '—').padStart(5)}` +
        ` itens=${uso.get(r.id) ?? 0}` +
        ` | marca="${r.marca ?? '—'}"`,
    );
  }

  // ---- Coerência macro x micro --------------------------------------------
  const incoerentes = validarCoerencia(registros);
  if (incoerentes.length > 0) {
    console.log(
      `\n[ERRO CRÍTICO] ${incoerentes.length} registro(s) declaram gordura ` +
        `total menor que a soma de ácidos graxos do perfil USDA ` +
        `(${SOMA_ACIDOS_GRAXOS.toFixed(3)} g/100 g):`,
    );
    for (const r of incoerentes) {
      console.log(
        `  #${r.id} gorduras=${r.gorduras} g/100 g < ${SOMA_ACIDOS_GRAXOS.toFixed(3)} g`,
      );
    }
    console.log(
      '\nGravar os micros nesses registros criaria dado fisicamente impossível.\n' +
        'Corrija o macro de gordura do registro (ou use outro perfil USDA) antes de aplicar.',
    );
    if (aplicar) {
      console.log('\n[ABORTADO] Nada foi gravado.');
      return;
    }
  } else {
    console.log(
      `\n[OK] Coerência de gordura: soma dos ácidos graxos ` +
        `${SOMA_ACIDOS_GRAXOS.toFixed(3)} g ≤ gordura total em todos os registros.`,
    );
  }

  const todosSeed = registros.every((r) =>
    (r.fonte ?? '').includes('seed-teste'),
  );
  if (todosSeed) {
    console.log(
      '\n[AVISO] Todos os registros vêm de "seed-teste". ' +
        'Se este é o banco de produção, avalie excluir em vez de consolidar.',
    );
  }

  // ---- Dedup --------------------------------------------------------------
  const porNome = new Map<string, RegistroWhey[]>();
  for (const r of registros) {
    const chave = (r.nomeExibicao || r.nome).toLowerCase().trim();
    const lista = porNome.get(chave) ?? [];
    lista.push(r);
    porNome.set(chave, lista);
  }

  const duplicados: number[] = [];
  for (const [chave, lista] of porNome.entries()) {
    if (lista.length > 1) {
      const manter = lista[0].id;
      const marcar = lista.slice(1).map((r) => r.id);
      console.log(
        `\nChave "${chave}": mantém #${manter}, marca ${marcar.join(', ')}`,
      );
      duplicados.push(...marcar);
    }
  }

  const pendentes = duplicados.filter((id) => {
    const r = registros.find((x) => x.id === id);
    return !jaMarcado(r?.marca);
  });

  console.log(
    `\nDuplicados: ${duplicados.length} total, ${pendentes.length} ainda sem selo.`,
  );

  const duplicadosEmUso = duplicados.filter((id) => (uso.get(id) ?? 0) > 0);
  if (duplicadosEmUso.length > 0) {
    console.log(
      `[ATENÇÃO] Em uso por itens de dieta: ${duplicadosEmUso.join(', ')}.`,
    );
  }

  if (!aplicar) {
    console.log('\nPara gravar: npx tsx prisma/scripts/preencher-whey-usda.ts --aplicar');
    return;
  }

  // ---- Aplicar: micros ----------------------------------------------------
  let preenchidos = 0;
  let preservados = 0;
  for (const r of registros) {
    if (r.calcio !== null) {
      preservados += 1;
      continue;
    }
    await prisma.baseAlimento.update({
      where: { id: r.id },
      data: {
        ...WHEY_USDA,
        fonte: fonteAcumulada(r.fonte),
      },
    });
    preenchidos += 1;
    console.log(
      `  #${r.id} micros gravados | fonte: "${r.fonte ?? '—'}" -> "${fonteAcumulada(r.fonte)}"`,
    );
  }
  console.log(`\nPreenchidos: ${preenchidos} | já tinham micros: ${preservados}`);

  // ---- Aplicar: marcar duplicados -----------------------------------------
  if (duplicados.length === 0) {
    console.log('Nada a marcar: não há duplicados.');
    return;
  }

  if (duplicadosEmUso.length > 0) {
    console.log(
      '\n[PARADO] Duplicado em uso por plano ativo. Remapeie antes de marcar.',
    );
    return;
  }

  if (pendentes.length === 0) {
    console.log('Todos os duplicados já estão selados — nada a fazer.');
    return;
  }

  for (const id of pendentes) {
    const r = registros.find((x) => x.id === id);
    const nova = marcaComSelo(r?.marca);
    await prisma.baseAlimento.update({
      where: { id },
      data: { marca: nova },
    });
    console.log(`  #${id} marca: "${r?.marca ?? '—'}" -> "${nova}"`);
  }
  console.log(`\nSelados: ${pendentes.length} registro(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });