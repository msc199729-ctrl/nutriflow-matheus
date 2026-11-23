import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const P = 7;
const D = 7;

type M = {
  kcal: number;
  proteina: number;
  carboidrato: number;
  gordura: number;
  fibra: number;
};

const Z: M = { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0, fibra: 0 };

const soma = (l: M[]): M =>
  l.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      proteina: a.proteina + m.proteina,
      carboidrato: a.carboidrato + m.carboidrato,
      gordura: a.gordura + m.gordura,
      fibra: a.fibra + m.fibra,
    }),
    { ...Z },
  );

const div = (m: M, n: number): M => ({
  kcal: m.kcal / n,
  proteina: m.proteina / n,
  carboidrato: m.carboidrato / n,
  gordura: m.gordura / n,
  fibra: m.fibra / n,
});

const mac = (g: number, a: any): M => {
  const f = g / 100;
  return {
    kcal: (a.calorias ?? 0) * f,
    proteina: (a.proteinas ?? 0) * f,
    carboidrato: (a.carboidratos ?? 0) * f,
    gordura: (a.gorduras ?? 0) * f,
    fibra: (a.fibras ?? 0) * f,
  };
};

const dv = (pr: number, co: number) =>
  !pr || pr <= 0 ? null : ((co - pr) / pr) * 100;

const f = (v: number | null, u = "", d = 1) =>
  v === null ? "—" : `${v.toFixed(d)}${u}`;

/** Dia local — igual ao diaDe() do analise-comparativo.service. */
const diaLocal = (d: Date): string => {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};

async function main() {
  const plano = await p.planoAlimentar.findFirst({
    where: { idPaciente: P, ativo: true, refeicoesPlanejadas: { some: {} } },
    orderBy: { id: "desc" },
    include: {
      refeicoesPlanejadas: {
        include: { itensDieta: { include: { alimento: true } } },
      },
    },
  });

  if (!plano) {
    console.log("sem plano ativo");
    await p.$disconnect();
    return;
  }

  const pr = plano.refeicoesPlanejadas.map((r) => ({
    nome: r.nome ?? "Refeição",
    ...soma(
      r.itensDieta
        .filter((i) => !i.aVontade)
        .map((i) => mac(Number(i.quantidadeGramas ?? 0), i.alimento)),
    ),
  }));

  const prT = soma(pr);

  const desde = new Date();
  desde.setDate(desde.getDate() - D);

  const regs = await p.registroDiario.findMany({
    where: { idPaciente: P, registradoEm: { gte: desde } },
    include: { itensConsumidos: { include: { alimento: true } } },
  });

  // macros por tipo + contador de REFEIÇÕES por tipo
  const map = new Map<string, { macros: M[]; refeicoes: number }>();
  const dias = new Set<string>();

  for (const r of regs) {
    if (r.registradoEm) dias.add(diaLocal(r.registradoEm));

    const t = (r.tipoRefeicao ?? "sem-tipo").toLowerCase().trim();
    if (!map.has(t)) map.set(t, { macros: [], refeicoes: 0 });

    const bucket = map.get(t)!;
    let temItem = false;

    for (const it of r.itensConsumidos) {
      const g = Number(it.quantidadeConsumida ?? 0);
      if (g <= 0) continue;
      bucket.macros.push(mac(g, it.alimento));
      temItem = true;
    }

    // conta a refeição, não os itens dentro dela
    if (temItem) bucket.refeicoes += 1;
  }

  const brutos = Array.from(map.entries()).map(([nome, b]) => ({
    nome,
    total: soma(b.macros),
    ocorrencias: b.refeicoes,
  }));

  const tot = soma(brutos.map((b) => b.total));
  const media = div(tot, D);

  console.log(
    `\nPlano [${plano.id}] ${plano.nome ?? ""} | registros ${regs.length} | dias ${dias.size}\n`,
  );

  console.log("Prescrito/dia:");
  for (const r of pr) {
    console.log(`  ${r.nome.padEnd(18)} ${f(r.kcal, " kcal", 0).padStart(9)}`);
  }
  console.log(`  ${"TOTAL".padEnd(18)} ${f(prT.kcal, " kcal", 0).padStart(9)}`);

  console.log("\nConsumido:");
  for (const b of brutos) {
    const m = div(b.total, D);
    console.log(
      `  ${b.nome.padEnd(18)} média ${f(m.kcal, " kcal", 0).padStart(8)} | bruto ${f(b.total.kcal, " kcal", 0).padStart(9)} | ${b.ocorrencias} refeições`,
    );
  }
  console.log(`  ${"MÉDIA/DIA".padEnd(18)} ${f(media.kcal, " kcal", 0).padStart(9)}`);

  console.log("\nDesvio:");
  const rows: [string, keyof M, string][] = [
    ["Calorias", "kcal", " kcal"],
    ["Proteína", "proteina", "g"],
    ["Carboidrato", "carboidrato", "g"],
    ["Gordura", "gordura", "g"],
    ["Fibra", "fibra", "g"],
  ];

  for (const [lb, k, u] of rows) {
    console.log(
      `  ${lb.padEnd(13)} presc ${f(prT[k], u).padStart(8)} | cons ${f(media[k], u).padStart(8)} | desvio ${f(dv(prT[k], media[k]), "%").padStart(8)}`,
    );
  }

  console.log(
    `\nSanidade total/${D} = ${f(tot.kcal / D, " kcal", 2)} vs media = ${f(media.kcal, " kcal", 2)} → ${
      Math.abs(tot.kcal / D - media.kcal) < 0.01 ? "OK" : "FALHOU"
    }`,
  );

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});