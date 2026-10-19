import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as path from 'node:path';
import type { PrismaClient } from '@prisma/client';

/** Linha do dump JSONL (origem: consulta TBCA — validar licença de uso). */
export type TbcaNutriente = {
  Componente: string;
  Unidades: string;
  'Valor por 100g': string;
};

export type TbcaAlimentoRow = {
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

function rowToPrismaData(row: TbcaAlimentoRow) {
  const { nutrientes: n } = row;
  const nome = row.descricao.trim() || row.codigo;
  return {
    nome,
    codigoTbca: row.codigo,
    classeTbca: row.classe || null,
    fonte: 'TBCA',
    calorias: nutriente(n, 'Energia', 'kcal'),
    carboidratos:
      nutriente(n, 'Carboidrato disponível') ??
      nutriente(n, 'Carboidrato total'),
    proteinas: nutriente(n, 'Proteína'),
    gorduras: nutriente(n, 'Lipídios'),
    fibras: nutriente(n, 'Fibra alimentar'),
    sodio: nutriente(n, 'Sódio'),
    ehUltraprocessado: false,
    scoreNova: null as number | null,
  };
}

const BATCH = 150;

export async function seedTbcaAlimentos(prisma: PrismaClient): Promise<void> {
  if (process.env.SKIP_TBCA_SEED === '1') {
    console.log('Seed TBCA: ignorado (SKIP_TBCA_SEED=1).');
    return;
  }

  const filePath = path.join(
    __dirname,
    'data',
    'alimentos-tbca.jsonl',
  );

  if (!fs.existsSync(filePath)) {
    console.warn(
      'Seed TBCA: arquivo não encontrado:',
      filePath,
      '(pulando importação).',
    );
    return;
  }

  let count = 0;
  let lineNo = 0;
  const batch: TbcaAlimentoRow[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    await prisma.$transaction(
      batch.map((row) => {
        const data = rowToPrismaData(row);
        return prisma.baseAlimento.upsert({
          where: { codigoTbca: row.codigo },
          create: data,
          update: {
            nome: data.nome,
            classeTbca: data.classeTbca,
            fonte: data.fonte,
            calorias: data.calorias,
            carboidratos: data.carboidratos,
            proteinas: data.proteinas,
            gorduras: data.gorduras,
            fibras: data.fibras,
            sodio: data.sodio,
          },
        });
      }),
    );
    count += batch.length;
    batch.length = 0;
  };

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: TbcaAlimentoRow;
    try {
      row = JSON.parse(trimmed) as TbcaAlimentoRow;
    } catch {
      throw new Error(`JSON inválido na linha ${lineNo} de ${filePath}`);
    }
    if (!row.codigo) {
      throw new Error(`Linha ${lineNo}: campo "codigo" ausente`);
    }
    batch.push(row);
    if (batch.length >= BATCH) await flush();
  }

  await flush();
  console.log('Seed TBCA:', count, 'alimentos upsert (codigo_tbca).');
}
