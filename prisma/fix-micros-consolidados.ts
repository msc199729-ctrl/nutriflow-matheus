import 'dotenv/config';
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Correção pontual do backfill de micros (Frente 1) para os alimentos
 * CONSOLIDADOS pelo consolidar-duplicatas.ts.
 *
 * O backfill-micros-tbca.ts casa por codigo_tbca — mas as duplicatas
 * consolidadas (banana, maçã, pão francês) foram apagadas e as versões
 * mantidas têm ID novo sem codigo_tbca. Este script aplica os micros da
 * TBCA diretamente nos alimentos mantidos.
 *
 * Uso: npx tsx prisma/fix-micros-consolidados.ts
 */

type TbcaNutriente = {
  Componente: string;
  Unidades: string;
  'Valor por 100g': string;
};

type TbcaAlimentoRow = {
  codigo: string;
  classe: string;
  descricao: string;
  nutrientes: TbcaNutriente[];
};

const VALOR_KEY = 'Valor por 100g' as const;

function parseValor100(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === 'NA' || s === 'ND' || s.toLowerCase() === 'tr') return null;
  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function nutriente(
  nutrientes: TbcaNutriente[],
  componente: string,
  unidades?: string,
): number | null {
  const found = unidades
    ? nutrientes.find(
        (x) => x.Componente === componente && x.Unidades === unidades,
      )
    : nutrientes.find((x) => x.Componente === componente);
  return found ? parseValor100(found[VALOR_KEY]) : null;
}

function colesterolMg(nutrientes: TbcaNutriente[]): number | null {
  const mg = nutriente(nutrientes, 'Colesterol', 'mg');
  if (mg != null) return mg;
  const g = nutriente(nutrientes, 'Colesterol', 'g');
  if (g != null) return g * 1000;
  return null;
}

function rowToMicros(row: TbcaAlimentoRow) {
  const n = row.nutrientes;
  return {
    calcio: nutriente(n, 'Cálcio'),
    ferro: nutriente(n, 'Ferro'),
    magnesio: nutriente(n, 'Magnésio'),
    fosforo: nutriente(n, 'Fósforo'),
    potassio: nutriente(n, 'Potássio'),
    zinco: nutriente(n, 'Zinco'),
    cobre: nutriente(n, 'Cobre'),
    selenio: nutriente(n, 'Selênio'),
    vitaminaARe: nutriente(n, 'Vitamina A (RE)'),
    vitaminaARae: nutriente(n, 'Vitamina A (RAE)'),
    vitaminaD: nutriente(n, 'Vitamina D'),
    vitaminaE: nutriente(n, 'Alfa-tocoferol (Vitamina E)'),
    tiamina: nutriente(n, 'Tiamina'),
    vitaminaB2: nutriente(n, 'Riboflavina'),
    vitaminaB3: nutriente(n, 'Niacina'),
    vitaminaB6: nutriente(n, 'Vitamina B6'),
    vitaminaB12: nutriente(n, 'Vitamina B12'),
    vitaminaC: nutriente(n, 'Vitamina C'),
    folato: nutriente(n, 'Equivalente de folato'),
    colesterol: colesterolMg(n),
    gorduraSaturada: nutriente(n, 'Ácidos graxos saturados'),
    gorduraMonoinsaturada: nutriente(n, 'Ácidos graxos monoinsaturados'),
    gorduraPoliinsaturada: nutriente(n, 'Ácidos graxos poliinsaturados'),
    gorduraTrans: nutriente(n, 'Ácidos graxos trans'),
    umidade: nutriente(n, 'Umidade'),
    carboidratoTotal: nutriente(n, 'Carboidrato total'),
    acucarAdicao: nutriente(n, 'Açúcar de adição'),
    salAdicao: nutriente(n, 'Sal de adição'),
    alcool: nutriente(n, 'Álcool'),
  };
}

/**
 * Código TBCA da linha apagada → alimento mantido pela consolidação.
 * idEsperado vem do mapa do consolidar-duplicatas.ts; padraoNome é a
 * verificação de segurança (o nome do alimento mantido tem que bater).
 */
const MAPA: {
  codigoTbca: string;
  idEsperado: number;
  padraoNome: RegExp;
  apelido: string;
}[] = [
  {
    codigoTbca: 'C0007C',
    idEsperado: 11435,
    padraoNome: /banana\s+nanica/i,
    apelido: 'Banana nanica',
  },
  {
    codigoTbca: 'C0011C',
    idEsperado: 11434,
    padraoNome: /banana\s+prata/i,
    apelido: 'Banana prata',
  },
  {
    codigoTbca: 'C0023C',
    idEsperado: 11436,
    padraoNome: /ma[çc][ãa]/i,
    apelido: 'Maçã com casca',
  },
  {
    codigoTbca: 'C0002A',
    idEsperado: 11431,
    padraoNome: /p[ãa]o\s+franc[êe]s/i,
    apelido: 'Pão francês',
  },
];

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const user = process.env.DB_USER ?? 'postgres';
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const name = process.env.DB_NAME ?? 'nutriflow';
  return `postgresql://${user}:${password}@${host}:${port}/${name}?schema=public`;
}

async function carregarLinhasTbca(): Promise<Map<string, TbcaAlimentoRow>> {
  const filePath = path.join(__dirname, 'data', 'alimentos-tbca.jsonl');
  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo não encontrado: ' + filePath);
  }
  const alvos = new Set(MAPA.map((m) => m.codigoTbca));
  const encontrados = new Map<string, TbcaAlimentoRow>();
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed) as TbcaAlimentoRow;
    if (alvos.has(row.codigo)) encontrados.set(row.codigo, row);
    if (encontrados.size === alvos.size) break;
  }
  return encontrados;
}

async function main() {
  const linhas = await carregarLinhasTbca();

  const adapter = new PrismaPg({ connectionString: getConnectionString() });
  const prisma = new PrismaClient({ adapter });

  let ok = 0;
  let falhas = 0;

  for (const alvo of MAPA) {
    const row = linhas.get(alvo.codigoTbca);
    if (!row) {
      console.log(`❌ ${alvo.apelido}: código ${alvo.codigoTbca} não está no dump`);
      falhas++;
      continue;
    }
    const micros = rowToMicros(row);

    // 1) tenta pelo ID esperado da consolidação, conferindo o nome
    const porId = await prisma.baseAlimento.findUnique({
      where: { id: alvo.idEsperado },
      select: { id: true, nome: true, nomeExibicao: true },
    });
    const nomePorId = porId ? (porId.nomeExibicao ?? porId.nome) : '';
    if (porId && alvo.padraoNome.test(nomePorId)) {
      await prisma.baseAlimento.update({ where: { id: porId.id }, data: micros });
      console.log(`✅ ${alvo.apelido}: micros aplicados no id ${porId.id} ("${nomePorId}")`);
      ok++;
      continue;
    }

    // 2) fallback: procura por nome em toda a base
    const termos = alvo.apelido.replace(/\s+/g, ' ').split(' ');
    const candidatos = await prisma.baseAlimento.findMany({
      where: {
        OR: termos.map((t) => ({
          OR: [{ nome: { contains: t } }, { nomeExibicao: { contains: t } }],
        })),
      },
      select: { id: true, nome: true, nomeExibicao: true },
      take: 50,
    });
    const alvoEncontrado = candidatos.find((c) =>
      alvo.padraoNome.test(c.nomeExibicao ?? c.nome),
    );
    if (alvoEncontrado) {
      await prisma.baseAlimento.update({
        where: { id: alvoEncontrado.id },
        data: micros,
      });
      console.log(
        `✅ ${alvo.apelido}: micros aplicados no id ${alvoEncontrado.id} ("${alvoEncontrado.nomeExibicao ?? alvoEncontrado.nome}", achado por busca de nome)`,
      );
      ok++;
    } else {
      console.log(
        `❌ ${alvo.apelido}: id ${alvo.idEsperado} não bate ("${nomePorId}") e nenhum candidato de nome casou. Candidatos vistos: ${candidatos.map((c) => c.nomeExibicao ?? c.nome).slice(0, 5).join(' | ') || 'nenhum'}`,
      );
      falhas++;
    }
  }

  console.log('---------------------------------------------');
  console.log(`Fix concluído: ${ok} corrigidos, ${falhas} falhas.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
