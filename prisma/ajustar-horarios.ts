import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function carregarEnv(): Record<string, string> {
  const mapa: Record<string, string> = {};

  for (const nome of [".env", ".env.local"]) {
    const caminho = join(process.cwd(), nome);
    if (!existsSync(caminho)) continue;

    for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
      const l = linha.trim();
      if (!l || l.startsWith("#")) continue;

      const i = l.indexOf("=");
      if (i === -1) continue;

      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in mapa)) mapa[k] = v;
    }
  }

  return mapa;
}

function resolverUrl(env: Record<string, string>): string {
  const diretas = [
    "DATABASE_URL",
    "DIRECT_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "DB_URL",
    "PG_URL",
    "PRISMA_DATABASE_URL",
  ];

  for (const k of diretas) {
    if (env[k]) return env[k];
  }

  // descobre a chave pelo datasource do schema
  const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf8");
    const m = schema.match(/url\s*=\s*env\(\s*["']([^"']+)["']\s*\)/);
    if (m && env[m[1]]) return env[m[1]];
  }

  // monta a partir de peças
  const pega = (...ks: string[]) => ks.map((k) => env[k]).find(Boolean);
  const host = pega("DB_HOST", "PGHOST", "POSTGRES_HOST");
  const port = pega("DB_PORT", "PGPORT", "POSTGRES_PORT") ?? "5432";
  const user = pega("DB_USER", "DB_USERNAME", "PGUSER", "POSTGRES_USER");
  const pass = pega("DB_PASSWORD", "DB_PASS", "PGPASSWORD", "POSTGRES_PASSWORD") ?? "";
  const db = pega("DB_NAME", "DB_DATABASE", "PGDATABASE", "POSTGRES_DB");

  if (host && user && db) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);
    return `postgresql://${u}:${p}@${host}:${port}/${db}?schema=public`;
  }

  const chaves = Object.keys(env).sort().join(", ");
  throw new Error(`Nao resolvi a URL. Chaves no .env: ${chaves}`);
}

const mascarar = (url: string) =>
  url.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1***$2");

const env = carregarEnv();
const connectionString = resolverUrl(env);

console.log("Conexao:", mascarar(connectionString));
console.log("");

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const hora = (h: number, m = 0) => new Date(1970, 0, 1, h, m, 0, 0);

const MAPA: Record<string, Date> = {
  "café da manhã": hora(8),
  "cafe da manha": hora(8),
  "café": hora(8),
  "cafe": hora(8),
  "colação": hora(10),
  "colacao": hora(10),
  "almoço": hora(12, 30),
  "almoco": hora(12, 30),
  "lanche da tarde": hora(16),
  "lanche": hora(16),
  "jantar": hora(19, 30),
  "ceia": hora(22),
};

const fmt = (d: Date | null): string =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "null";

async function main() {
  const antes = await p.refeicaoPlanejada.findMany({
    where: { idPlanoAlimentar: 1 },
    select: { id: true, nome: true, horarioSugerido: true },
    orderBy: { id: "asc" },
  });

  if (antes.length === 0) {
    console.log("Nenhuma refeicao no plano 1.");
    await p.$disconnect();
    return;
  }

  console.log("=== ANTES ===");
  for (const r of antes) {
    console.log(`  [${r.id}] ${(r.nome ?? "").padEnd(20)} ${fmt(r.horarioSugerido)}`);
  }

  for (const r of antes) {
    const chave = (r.nome ?? "").toLowerCase().trim();
    const novo = MAPA[chave];

    if (!novo) {
      console.log(`  aviso: sem mapa para "${r.nome}" - mantido`);
      continue;
    }

    await p.refeicaoPlanejada.update({
      where: { id: r.id },
      data: { horarioSugerido: novo },
    });
  }

  const depois = await p.refeicaoPlanejada.findMany({
    where: { idPlanoAlimentar: 1 },
    select: { id: true, nome: true, horarioSugerido: true },
    orderBy: { horarioSugerido: "asc" },
  });

  console.log("\n=== DEPOIS ===");
  for (const r of depois) {
    console.log(`  [${r.id}] ${(r.nome ?? "").padEnd(20)} ${fmt(r.horarioSugerido)}`);
  }

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await p.$disconnect();
  process.exit(1);
});
