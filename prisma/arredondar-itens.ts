import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const FRACOES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

function arredondar(q: number): number {
  return FRACOES.reduce((prev, curr) =>
    Math.abs(curr - q) < Math.abs(prev - q) ? curr : prev,
  );
}

function textoMedida(qtd: number, nome: string): string {
  const q = Number.isInteger(qtd) ? String(qtd) : String(qtd).replace(".", ",");
  return `${q} ${nome}`;
}

async function main() {
  const itens = await p.itemDieta.findMany({
    where: {
      idMedidaCaseira: { not: null },
      quantidadeMedida: { not: null },
    },
    include: {
      medidaRef: { select: { nome: true, gramas: true } },
      alimento: { select: { nome: true, nomeExibicao: true } },
    },
  });

  console.log(`Analisando ${itens.length} item(ns) com medida vinculada...\n`);

  let ajustados = 0;

  for (const it of itens) {
    if (!it.medidaRef) continue;

    const atual = Number(it.quantidadeMedida ?? 0);
    const gramasPorMedida = Number(it.medidaRef.gramas);
    if (!Number.isFinite(gramasPorMedida) || gramasPorMedida <= 0) continue;

    const gramasAlvo = Number(it.quantidadeGramas ?? 0);
    if (!Number.isFinite(gramasAlvo) || gramasAlvo <= 0) continue;

    const bruto = gramasAlvo / gramasPorMedida;
    const arredondada = arredondar(bruto);
    const gramasFinais = Math.round(arredondada * gramasPorMedida * 10) / 10;
    const textoNovo = textoMedida(arredondada, it.medidaRef.nome);

    const mudouQtd = Math.abs(arredondada - atual) > 0.01;
    const mudouTexto = textoNovo !== it.medidaCaseira;
    if (!mudouQtd && !mudouTexto) continue;

    const nome = it.alimento.nomeExibicao ?? it.alimento.nome;
    console.log(`${nome} (item ${it.id})`);
    console.log(`  Atual: ${atual} × ${it.medidaRef.nome} = ${gramasAlvo}g`);
    console.log(`  Novo:  ${arredondada} × ${it.medidaRef.nome} = ${gramasFinais}g`);
    console.log(`  Texto: "${it.medidaCaseira}" → "${textoNovo}"\n`);

    await p.itemDieta.update({
      where: { id: it.id },
      data: {
        quantidadeMedida: arredondada,
        quantidadeGramas: gramasFinais,
        medidaCaseira: textoNovo,
      },
    });
    ajustados++;
  }

  console.log(`\n✅ ${ajustados} item(ns) recalculado(s).`);
  await p.$disconnect();
}

main();