/**
 * Diagnóstico de micronutrientes — diz por que a aba "Total de nutrientes"
 * aparece vazia, em um comando só.
 *
 * Uso (na raiz do backend):
 *   npx tsx prisma/scripts/diagnostico-micros.ts            # analisa os 5 planos mais recentes
 *   npx tsx prisma/scripts/diagnostico-micros.ts 11         # analisa só o plano 11
 *
 * O que ele responde:
 *   1. Os alimentos do plano têm codigo_tbca?
 *   2. Têm micronutrientes preenchidos?
 *   3. Qual a causa da aba vazia — e qual correção aplicar.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Os 23 campos de micro que o painel lê (mesmos nomes do schema). */
const MICRO = [
  'calcio', 'ferro', 'magnesio', 'fosforo', 'potassio', 'zinco', 'cobre', 'selenio',
  'vitaminaARae', 'vitaminaC', 'vitaminaD', 'vitaminaE', 'tiamina',
  'vitaminaB2', 'vitaminaB3', 'vitaminaB6', 'vitaminaB12', 'folato',
  'gorduraSaturada', 'gorduraMonoinsaturada', 'gorduraPoliinsaturada', 'gorduraTrans',
  'colesterol',
] as const;

type Alimento = {
  id: number;
  nome: string;
  nomeExibicao: string | null;
  codigoTbca: string | null;
  fonte: string | null;
} & Partial<Record<(typeof MICRO)[number], number | null>>;

function microsPreenchidos(a: Alimento): number {
  return MICRO.filter((c) => typeof a[c] === 'number').length;
}

function linha(caractere = '─', n = 74): string {
  return caractere.repeat(n);
}

function pct(parte: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((parte / total) * 100)}%`;
}

async function preenchimentoGeral(): Promise<void> {
  const total = await prisma.baseAlimento.count();
  if (total === 0) {
    console.log('\n⚠ A tabela base_alimentos está VAZIA neste banco.');
    console.log('  Se o app funciona, você está conectado no banco errado.');
    console.log('  Confira DB_NAME no .env contra o banco que o backend usa.');
    return;
  }

  const comAlgum = await prisma.baseAlimento.count({
    where: { OR: MICRO.map((c) => ({ [c]: { not: null } })) },
  });
  const comCodigo = await prisma.baseAlimento.count({
    where: { codigoTbca: { not: null } },
  });

  console.log(linha());
  console.log('PREENCHIMENTO GERAL DA TABELA');
  console.log(linha());
  console.log(`  base_alimentos        : ${total} alimentos`);
  console.log(`  com codigo_tbca       : ${comCodigo} (${pct(comCodigo, total)})`);
  console.log(`  com ≥1 micronutriente : ${comAlgum} (${pct(comAlgum, total)})`);
  console.log();
}

async function analisarPlano(idPlano: number): Promise<void> {
  const plano = await prisma.planoAlimentar.findUnique({
    where: { id: idPlano },
    select: {
      id: true,
      nome: true,
      ativo: true,
      tipoPlano: true,
      paciente: { select: { nome: true } },
      refeicoesPlanejadas: {
        select: {
          nome: true,
          itensDieta: {
            select: {
              quantidadeGramas: true,
              aVontade: true,
              alimento: {
                select: {
                  id: true,
                  nome: true,
                  nomeExibicao: true,
                  codigoTbca: true,
                  fonte: true,
                  ...Object.fromEntries(MICRO.map((c) => [c, true])),
                },
              },
            },
          },
        },
      },
    },
  });

  if (!plano) {
    console.log(`\n✗ Plano ${idPlano} não encontrado neste banco.`);
    return;
  }

  console.log(linha());
  console.log(`PLANO ${plano.id} — ${plano.nome ?? '(sem nome)'}`);
  console.log(
    `  paciente: ${plano.paciente?.nome ?? '?'} · ${plano.tipoPlano} · ${
      plano.ativo ? 'ativo' : 'inativo'
    }`,
  );
  console.log(linha());

  // Deduplica alimentos e soma gramas
  const porAlimento = new Map<number, { alimento: Alimento; gramas: number; vezes: number }>();
  for (const ref of plano.refeicoesPlanejadas) {
    for (const it of ref.itensDieta) {
      const atual = porAlimento.get(it.alimento.id);
      const g = it.quantidadeGramas ?? 0;
      if (atual) {
        atual.gramas += g;
        atual.vezes += 1;
      } else {
        porAlimento.set(it.alimento.id, {
          alimento: it.alimento as Alimento,
          gramas: g,
          vezes: 1,
        });
      }
    }
  }

  if (porAlimento.size === 0) {
    console.log('\n⚠ O plano não tem itens (refeições vazias).');
    return;
  }

  console.log(
    '\n  ALIMENTO'.padEnd(44)
    + 'TBCA?'.padEnd(8)
    + 'MICROS'.padEnd(9)
    + 'GRAMAS',
  );
  console.log('  ' + linha('·', 68));

  const semMicroComCodigo: string[] = [];
  const semMicroSemCodigo: string[] = [];
  const comMicro: string[] = [];

  for (const { alimento, gramas, vezes } of [...porAlimento.values()].sort(
    (a, b) => b.gramas - a.gramas,
  )) {
    const nome = (alimento.nomeExibicao || alimento.nome).slice(0, 38);
    const temCodigo = !!alimento.codigoTbca;
    const nMicros = microsPreenchidos(alimento);

    const marcaCodigo = temCodigo ? '✓ sim' : '✗ NÃO';
    const marcaMicros =
      nMicros === 0 ? '✗ 0/23' : nMicros < 10 ? `⚠ ${nMicros}/23` : `✓ ${nMicros}/23`;

    console.log(
      '  ' + nome.padEnd(42)
      + marcaCodigo.padEnd(8)
      + marcaMicros.padEnd(9)
      + `${Math.round(gramas)}g${vezes > 1 ? ` (${vezes}x)` : ''}`,
    );

    if (nMicros === 0) {
      (temCodigo ? semMicroComCodigo : semMicroSemCodigo).push(
        alimento.codigoTbca ?? nome,
      );
    } else {
      comMicro.push(nome);
    }
  }

  // ── Veredito ──────────────────────────────────────────────────────
  console.log('\n' + linha());
  console.log('VEREDITO');
  console.log(linha());

  if (semMicroComCodigo.length === 0 && semMicroSemCodigo.length === 0) {
    console.log('  ✓ Todos os alimentos do plano têm micronutrientes.');
    console.log('  Se a aba ainda mostra vazio, o problema é no endpoint/front — me manda o print.');
  } else if (semMicroSemCodigo.length > 0) {
    console.log(
      `\n  ✗ ${semMicroSemCodigo.length} alimento(s) SEM micronutrientes e SEM codigo_tbca:`,
    );
    for (const n of semMicroSemCodigo) console.log(`      · ${n}`);
    console.log(
      '\n  CAUSA: são alimentos canônicos/limpos criados fora da TBCA — o backfill',
      '\n  casa por código e não tem como achá-los.',
      '\n  CORREÇÃO: casamento por NOME contra a TBCA (com salvaguardas: nome',
      '\n  normalizado + mesma classe; revisão manual dos ambíguos).',
    );
  }
  if (semMicroComCodigo.length > 0) {
    console.log(
      `\n  ✗ ${semMicroComCodigo.length} alimento(s) SEM micronutrientes mas COM codigo_tbca:`,
    );
    for (const n of semMicroComCodigo) console.log(`      · ${n}`);
    console.log(
      '\n  CAUSA: o backfill de micros não passou por eles.',
      '\n  CORREÇÃO: rodar o importador por código:',
      '\n    npx tsx prisma/scripts/import-micronutrientes-tbca.ts --dry-run',
      '\n    npx tsx prisma/scripts/import-micronutrientes-tbca.ts',
    );
  }
  console.log();
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg && /^\d+$/.test(arg)) {
    await preenchimentoGeral();
    await analisarPlano(Number(arg));
    return;
  }

  await preenchimentoGeral();

  const planos = await prisma.planoAlimentar.findMany({
    orderBy: { id: 'desc' },
    take: 5,
    select: { id: true, nome: true, ativo: true, _count: { select: { refeicoesPlanejadas: true } } },
  });

  if (planos.length === 0) {
    console.log('Nenhum plano alimentar neste banco.');
    return;
  }

  console.log('Últimos 5 planos — rode com o ID para analisar um:');
  for (const p of planos) {
    console.log(
      `  npx tsx prisma/scripts/diagnostico-micros.ts ${p.id}   # ${
        p.nome ?? '(sem nome)'
      } · ${p.ativo ? 'ativo' : 'inativo'} · ${p._count.refeicoesPlanejadas} refeições`,
    );
  }
  console.log('\nAnalisando o mais recente:\n');
  await analisarPlano(planos[0].id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
