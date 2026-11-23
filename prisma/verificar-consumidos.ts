import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

async function main() {
  const itens = await p.itemConsumido.findMany({
    take: 20,
    orderBy: { id: "desc" },
    include: {
      alimento: {
        select: {
          nome: true,
          nomeExibicao: true,
          calorias: true,
          proteinas: true,
          carboidratos: true,
          gorduras: true,
        },
      },
      registro: { select: { tipoRefeicao: true, registradoEm: true } },
    },
  });

  if (itens.length === 0) {
    console.log("Nenhum ItemConsumido no banco.");
    await p.$disconnect();
    return;
  }

  console.log(`Total: ${itens.length} item(ns)\n`);

  for (const i of itens) {
    const q = i.quantidadeConsumida;
    const nome = i.alimento.nomeExibicao ?? i.alimento.nome;
    console.log(
      `[${i.id}] ${nome}\n` +
        `   quantidade: ${q}\n` +
        `   refeição: ${i.registro.tipoRefeicao ?? "—"}\n` +
        `   kcal/100g: ${i.alimento.calorias}\n` +
        `   origem: ${i.origem ?? "—"}\n`,
    );
  }

  const valores = itens
    .map((i) => Number(i.quantidadeConsumida ?? 0))
    .filter((v) => v > 0);

  if (valores.length > 0) {
    const max = Math.max(...valores);
    const min = Math.min(...valores);
    console.log("=== DIAGNÓSTICO ===");
    console.log(`Mínimo: ${min} | Máximo: ${max}`);
    console.log(
      max > 10
        ? "✅ Provável GRAMAS — o cálculo do comparativo atual serve."
        : "❌ Provável PORÇÕES — precisamos de idMedidaCaseira no ItemConsumido.",
    );
  }

  await p.$disconnect();
}

main();