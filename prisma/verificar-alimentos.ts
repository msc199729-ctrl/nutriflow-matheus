import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";
import { temResiduoLatino } from "../src/foods/foods.service";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

/** Só grafias erradas de verdade. "beterraba" é correta e NÃO entra aqui. */
const TYPO = /\b(?:feji[aã]o|dreand[oa]|bet+rraba|beterrraba|bet[ae]rr+aba|[oó]loe|curcubita)\b/i;

async function main() {
  const rows = await p.baseAlimento.findMany({
    select: { id: true, nomeExibicao: true },
  });

  const residuo = rows.filter((r) => temResiduoLatino(r.nomeExibicao));
  const typo = rows.filter((r) => TYPO.test(r.nomeExibicao ?? ""));

  console.log(`Total:                 ${rows.length}`);
  console.log(`Com resíduo latino:    ${residuo.length}`);
  console.log(`Com erro de digitação: ${typo.length}`);

  if (residuo.length) {
    console.log("\n--- resíduo ---");
    console.table(residuo.slice(0, 30).map((r) => ({ id: r.id, nomeExibicao: r.nomeExibicao })));
  }
  if (typo.length) {
    console.log("\n--- typo ---");
    console.table(typo.slice(0, 30).map((r) => ({ id: r.id, nomeExibicao: r.nomeExibicao })));
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });