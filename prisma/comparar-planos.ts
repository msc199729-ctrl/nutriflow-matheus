import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const A = Number(process.argv[2] ?? 1);
const B = Number(process.argv[3] ?? 5);

const f = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : Number(v).toFixed(d);

const hora = (d: Date | null) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "—";

async function carregar(id: number) {
  const plano = await p.planoAlimentar.findUnique({
    where: { id },
    include: {
      refeicoesPlanejadas: {
        orderBy: { horarioSugerido: "asc" },
        include: { itensDieta: { include: { alimento: true } } },
      },
    },
  });
  if (!plano) return null;

  const refeicoes = plano.refeicoesPlanejadas.map((r) => {
    const itens = r.itensDieta.map((i) => {
      const g = Number(i.quantidadeGramas ?? 0);
      const fator = i.aVontade ? 0 : g / 100;
      return {
        nome: i.alimento.nome,
        g,
        aVontade: i.aVontade,
        medida: i.medidaCaseira ?? "",
        kcal: (i.alimento.calorias ?? 0) * fator,
        ptn: (i.alimento.proteinas ?? 0) * fator,
        cho: (i.alimento.carboidratos ?? 0) * fator,
        lip: (i.alimento.gorduras ?? 0) * fator,
        fib: (i.alimento.fibras ?? 0) * fator,
      };
    });

    const soma = itens.reduce(
      (a, x) => ({
        kcal: a.kcal + x.kcal,
        ptn: a.ptn + x.ptn,
        cho: a.cho + x.cho,
        lip: a.lip + x.lip,
        fib: a.fib + x.fib,
      }),
      { kcal: 0, ptn: 0, cho: 0, lip: 0, fib: 0 },
    );

    return { nome: r.nome ?? "", horario: r.horarioSugerido, itens, soma };
  });

  return { id: plano.id, nome: plano.nome, ativo: plano.ativo, refeicoes };
}

async function main() {
  const a = await carregar(A);
  const b = await carregar(B);

  if (!a) {
    console.log(`Plano ${A} nao existe.`);
    await p.$disconnect();
    return;
  }
  if (!b) {
    console.log(`Plano ${B} nao existe.`);
    await p.$disconnect();
    return;
  }

  for (const plano of [a, b]) {
    console.log(
      `\n=== Plano [${plano.id}] ${plano.nome ?? ""} ${plano.ativo ? "(ATIVO)" : "(inativo)"} ===`,
    );

    for (const r of plano.refeicoes) {
      console.log(`\n${r.nome} — ${hora(r.horario)}`);

      for (const i of r.itens) {
        const flag = i.aVontade ? "A-VONTADE" : "         ";
        console.log(
          `  ${i.nome.slice(0, 36).padEnd(36)} ${String(f(i.g, 0)).padStart(5)}g ${flag} ${String(f(i.kcal, 0)).padStart(5)} kcal | P${f(i.ptn)} C${f(i.cho)} G${f(i.lip)} F${f(i.fib)}${i.medida ? ` | ${i.medida}` : ""}`,
        );
      }

      console.log(
        `  ${"-".repeat(36)} TOTAL ${String(f(r.soma.kcal, 0)).padStart(5)} kcal | P${f(r.soma.ptn)} C${f(r.soma.cho)} G${f(r.soma.lip)} F${f(r.soma.fib)}`,
      );
    }
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});