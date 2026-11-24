import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";
import { limparNomeCompleto, temResiduoLatino } from "../src/foods/foods.service";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const DRY = process.argv.includes("--dry");
const REVISAR = process.argv.includes("--revisar");

/** Tokens que denunciam erro de digitação da TBCA. */
const SUSPEITOS = /feji|dreand|bet?err+aba|oloe|óloe|mu[çc]arel+a\b/i;

async function main() {
  const rows = await p.baseAlimento.findMany({
    select: { id: true, nome: true, nomeExibicao: true, nomeBusca: true },
    orderBy: { id: "asc" },
  });

  if (REVISAR) {
    const suspeitos = rows.filter((r) => SUSPEITOS.test(r.nome));
    console.log(`Nomes com possível erro de digitação: ${suspeitos.length}`);
    for (const r of suspeitos.slice(0, 60)) {
      console.log(`#${r.id}  ${r.nome}`);
    }
    if (suspeitos.length > 60) console.log("… (lista truncada)");
    await p.$disconnect();
    return;
  }

  let alvo = 0;
  let corrigidos = 0;

  for (const r of rows) {
    const atual = r.nomeExibicao ?? '';
    if (!temResiduoLatino(atual) && !temResiduoLatino(r.nome)) continue;
    alvo++;

    const { exibicao, busca } = limparNomeCompleto(r.nome);
    if (exibicao === atual && busca === (r.nomeBusca ?? "")) continue;

    if (DRY) {
      console.log(`#${r.id}  "${atual}" → "${exibicao}"`);
    } else {
      await p.baseAlimento.update({
        where: { id: r.id },
        data: { nomeExibicao: exibicao, nomeBusca: busca },
      });
    }
    corrigidos++;
  }

  console.log(`\nTotal: ${rows.length}`);
  console.log(`Com resíduo latino: ${alvo}`);
  console.log(`${DRY ? "Seriam corrigidos" : "Corrigidos"}: ${corrigidos}`);

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});