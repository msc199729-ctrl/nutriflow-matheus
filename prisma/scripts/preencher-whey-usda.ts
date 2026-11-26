/**
 * Preenche micronutrientes do Whey Protein Concentrado a partir do USDA
 * FoodData Central (fdcId 173180, "Beverages, Protein powder whey based",
 * SR Legacy) — a TBCA não cobre suplementos e os rótulos brasileiros
 * (Max Titanium, Dux, Growth, Integralmédica) só trazem macros + sódio.
 *
 * DOIS PERFIS (flag --perfil):
 *
 *   --perfil=wpc80 (padrão)
 *     Normaliza os valores para o teor proteico do registro no banco.
 *     O FDC 173180 é um pó proteico diluído (P ~58 g/100 g); o registro é
 *     WPC80 real (P 78 g/100 g). Gravar micro de matriz diferente do macro
 *     produz inconsistência que aparece no painel de nutrientes.
 *     fator = proteinaRegistro / 58  →  aplicado a todos os campos.
 *
 *   --perfil=usda
 *     Valores brutos do FDC 173180, sem correção. Conservador (subestima).
 *
 * Natureza do dado: no perfil wpc80 os valores são EXTRAPOLAÇÃO LINEAR de uma
 * base publicada, não medição do produto. O fator e o teor proteico ficam
 * registrados no campo `fonte` de cada linha.
 *
 * Uso (na raiz do backend):
 *   npx tsx prisma/scripts/preencher-whey-usda.ts                        # relatório
 *   npx tsx prisma/scripts/preencher-whey-usda.ts --aplicar              # grava wpc80
 *   npx tsx prisma/scripts/preencher-whey-usda.ts --aplicar --perfil=usda # grava bruto
 *
 * Também DEDUPLICA: mantém o de menor id (o que os planos referenciam) e sela
 * os demais com "[DUPLICADO]" na marca, de forma idempotente.
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
 * Valores por 100 g do produto de referência.
 * https://fdc.nal.usda.gov/fdc-app.html#/food-details/173180/nutrients
 */
const WHEY_BASE = {
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

/** Teor proteico do produto de referência USDA, g/100 g. */
const PROTEINA_BASE_USDA = 58;

/** Faixa de fator aceitável. Fora disso, o registro não é whey — abortar. */
const FATOR_MIN = 0.9;
const FATOR_MAX = 1.8;

const FONTE_PREFIXO = 'USDA FDC 173180';
const MARCA_DUPLICADO = 'DUPLICADO - consolidar';

type TipoPerfil = 'wpc80' | 'usda';

interface ResultadoPerfil {
  ok: boolean;
  erro?: string;
  fator: number;
  valores: Record<string, number>;
  notaFonte: string;
}

/**
 * Monta o conjunto de valores para o perfil escolhido, em função do teor
 * proteico do registro no banco.
 */
function montarPerfil(
  perfil: TipoPerfil,
  proteinas: number | null,
): ResultadoPerfil {
  if (perfil === 'usda') {
    return {
      ok: true,
      fator: 1,
      valores: { ...WHEY_BASE },
      notaFonte: 'whey concentrate, perfil USDA bruto (P ref. 58 g/100 g)',
    };
  }

  if (proteinas == null || proteinas <= 0) {
    return {
      ok: false,
      erro: 'registro sem proteína declarada — impossível normalizar',
      fator: 1,
      valores: {},
      notaFonte: '',
    };
  }

  const fator = proteinas / PROTEINA_BASE_USDA;
  if (fator < FATOR_MIN || fator > FATOR_MAX) {
    return {
      ok: false,
      erro:
        `fator ${fator.toFixed(3)} fora da faixa ${FATOR_MIN}–${FATOR_MAX} ` +
        `(P ${proteinas} g/100 g). Confira se o registro é mesmo whey.`,
      fator,
      valores: {},
      notaFonte: '',
    };
  }

  const valores = Object.fromEntries(
    Object.entries(WHEY_BASE).map(([chave, v]) => [
      chave,
      Number((v * fator).toFixed(3)),
    ]),
  ) as Record<string, number>;

  return {
    ok: true,
    fator,
    valores,
    notaFonte:
      `whey concentrate normalizado p/ WPC80 ` +
      `(P ${proteinas} g/100 g, fator ${fator.toFixed(3)})`,
  };
}

/** Detecta marca já sinalizada, seja pelo fallback ou pelo sufixo. */
function jaMarcado(marca: string | null | undefined): boolean {
  return /duplicado/i.test(marca ?? '');
}

/** Sela duplicado sem destruir o valor original e sem duplicar. Idempotente. */
function marcaComSelo(original: string | null | undefined): string {
  const base = (original ?? '').trim();
  if (!base) return MARCA_DUPLICADO;
  if (jaMarcado(base)) return base;
  return `${base} [DUPLICADO]`;
}

/**
 * Reescreve a fonte preservando segmentos de outras origens (ex.: seed-teste)
 * e substituindo qualquer segmento USDA anterior. Evita acumular lixo quando
 * o script roda várias vezes com perfis diferentes.
 */
function fonteComPerfil(
  original: string | null | undefined,
  notaFonte: string,
): string {
  const partes = (original ?? '')
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  const preservadas = partes.filter((p) => !p.startsWith(FONTE_PREFIXO));
  return [...preservadas, `${FONTE_PREFIXO} (SR Legacy) — ${notaFonte}`].join(
    ' | ',
  );
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
 * Só sobrescreve o que é nosso ou o que está vazio.
 * Qualquer dado vindo de outra fonte é intocado.
 */
function precisaAtualizar(r: RegistroWhey): boolean {
  if (r.calcio === null) return true;
  return (r.fonte ?? '').includes(FONTE_PREFIXO);
}

/** Ácidos graxos não podem exceder a gordura total declarada. */
function somaAcidosGraxos(valores: Record<string, number>): number {
  return (
    (valores.gorduraSaturada ?? 0) +
    (valores.gorduraMonoinsaturada ?? 0) +
    (valores.gorduraPoliinsaturada ?? 0)
  );
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const perfilFlag =
    process.argv.find((a) => a.startsWith('--perfil='))?.split('=')[1] ?? 'wpc80';
  const perfil: TipoPerfil = perfilFlag === 'usda' ? 'usda' : 'wpc80';

  console.log(
    aplicar ? 'MODO APLICAR (vai gravar)' : 'MODO RELATÓRIO (nada grava)',
  );
  console.log(`Perfil: ${perfil}`);

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
    const rotulo = (r.nomeExibicao || r.nome).padEnd(34);
    console.log(
      `  #${String(r.id).padStart(6)} ${rotulo}` +
        ` kcal=${String(r.calorias ?? '—').padStart(5)}` +
        ` P=${String(r.proteinas ?? '—').padStart(5)}` +
        ` G=${String(r.gorduras ?? '—').padStart(5)}` +
        ` itens=${uso.get(r.id) ?? 0}` +
        ` | ${r.calcio === null ? 'micro vazio' : 'micro ok'}`,
    );
  }

  // ---- Perfil por registro ------------------------------------------------
  const planos = new Map<number, ResultadoPerfil>();
  let algumErro = false;
  for (const r of registros) {
    const p = montarPerfil(perfil, r.proteinas);
    planos.set(r.id, p);
    if (!p.ok) {
      algumErro = true;
      console.log(`\n[ERRO] #${r.id}: ${p.erro}`);
    }
  }
  if (algumErro && aplicar) {
    console.log('\n[ABORTADO] Corrija os registros acima. Nada foi gravado.');
    return;
  }

  // ---- Coerência macro x micro -------------------------------------------
  const referencia = planos.get(registros[0].id);
  if (referencia?.ok) {
    const soma = somaAcidosGraxos(referencia.valores);
    const invalidos = registros.filter(
      (r) => r.gorduras != null && soma > r.gorduras + 0.05,
    );
    console.log(
      `\nSoma dos ácidos graxos do perfil: ${soma.toFixed(3)} g/100 g`,
    );
    if (invalidos.length > 0) {
      console.log('[ERRO CRÍTICO] Gordura total menor que a soma dos AG:');
      for (const r of invalidos) {
        console.log(`  #${r.id} gorduras=${r.gorduras} < ${soma.toFixed(3)}`);
      }
      if (aplicar) {
        console.log('\n[ABORTADO] Nada foi gravado.');
        return;
      }
    } else {
      console.log('[OK] Coerência de gordura em todos os registros.');
    }
  }

  // ---- Prévia -------------------------------------------------------------
  if (referencia?.ok) {
    console.log(`\nValores por 100 g (perfil ${perfil}):`);
    for (const [campo, v] of Object.entries(referencia.valores)) {
      const base = (WHEY_BASE as Record<string, number>)[campo] ?? 0;
      const delta = v !== base ? `  (base ${base})` : '';
      console.log(`  ${campo.padEnd(22)} ${String(v).padStart(8)}${delta}`);
    }
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
      console.log(
        `\nChave "${chave}": mantém #${lista[0].id}, ` +
          `marca ${lista.slice(1).map((r) => r.id).join(', ')}`,
      );
      duplicados.push(...lista.slice(1).map((r) => r.id));
    }
  }

  const pendentes = duplicados.filter((id) => {
    const r = registros.find((x) => x.id === id);
    return !jaMarcado(r?.marca);
  });
  const duplicadosEmUso = duplicados.filter((id) => (uso.get(id) ?? 0) > 0);

  if (!aplicar) {
    console.log(
      '\nPara gravar: npx tsx prisma/scripts/preencher-whey-usda.ts --aplicar' +
        (perfil !== 'wpc80' ? ` --perfil=${perfil}` : ''),
    );
    return;
  }

  // ---- Aplicar micros -----------------------------------------------------
  let atualizados = 0;
  let preservados = 0;
  for (const r of registros) {
    if (!precisaAtualizar(r)) {
      preservados += 1;
      console.log(`  #${r.id} micro de outra fonte — preservado.`);
      continue;
    }
    const p = planos.get(r.id);
    if (!p?.ok) continue;

    await prisma.baseAlimento.update({
      where: { id: r.id },
      data: {
        ...p.valores,
        fonte: fonteComPerfil(r.fonte, p.notaFonte),
      },
    });
    atualizados += 1;
    console.log(
      `  #${r.id} micros gravados (fator ${p.fator.toFixed(3)}) | fonte: "${r.fonte ?? '—'}"`,
    );
  }
  console.log(`\nAtualizados: ${atualizados} | preservados: ${preservados}`);

  // ---- Aplicar selo de duplicado ------------------------------------------
  if (duplicados.length === 0) {
    console.log('Nada a marcar: não há duplicados.');
    return;
  }
  if (duplicadosEmUso.length > 0) {
    console.log(
      `\n[PARADO] Duplicado em plano ativo: ${duplicadosEmUso.join(', ')}. ` +
        'Remapeie antes de marcar.',
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