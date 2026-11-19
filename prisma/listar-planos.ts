import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const PACIENTE_ID = 7;

async function main() {
  const planos = await p.planoAlimentar.findMany({
    where: { idPaciente: PACIENTE_ID },
    orderBy: { id: "desc" },
    include: {
      refeicoesPlanejadas: {
        select: {
          id: true,
          nome: true,
          horarioSugerido: true,
          _count: { select: { itensDieta: true } },
        },
      },
    },
  });

  if (planos.length === 0) {
    console.log(`Paciente ${PACIENTE_ID} sem planos.`);
    await p.$disconnect();
    return;
  }

  console.log(`Paciente ${PACIENTE_ID} — ${planos.length} plano(s)\n`);

  for (const pl of planos) {
    const totalItens = pl.refeicoesPlanejadas.reduce(
      (a, r) => a + r._count.itensDieta,
      0,
    );
    console.log(
      `[${pl.id}] ${pl.nome ?? "(sem nome)"} (${pl.tipoPlano}) ativo=${pl.ativo} → ` +
        `${pl.refeicoesPlanejadas.length} refeição(ões), ${totalItens} item(ns)`,
    );
    for (const r of pl.refeicoesPlanejadas) {
      const h = r.horarioSugerido
        ? r.horarioSugerido.toISOString().slice(11, 16)
        : "—";
      console.log(
        `      • ${r.nome ?? "(sem nome)"} (${h}) — ${r._count.itensDieta} item(ns)`,
      );
    }
    console.log();
  }

  await p.$disconnect();
}

main();