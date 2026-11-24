import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";
import { writeFileSync } from "node:fs";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const CONECTORES = new Set(["e","com","sem","de","da","do","das","dos","ao","em","no","na"]);

const ALIMENTOS = new Set([
  "salsa","salsinha","cebolinha","coentro","alecrim","manjericao","manjericão",
  "americana","americano","alface","curcuma","cúrcuma","tomate","cenoura",
  "batata","banana","laranja","limao","limão","manga","pera","uva","figo",
  "milho","arroz","feijao","feijão","trigo","aveia","soja","mandioca",
  "inhame","cara","cará","abobora","abóbora","abobrinha","chuchu","pepino",
  "pimentao","pimentão","cebola","alho","brocolis","brócolis","couve",
  "repolho","espinafre","rucula","rúcula","agriao","agrião","beterraba",
  "rabanete","nabo","vagem","ervilha","lentilha","amendoim","castanha",
  "noz","amendoa","amêndoa","avela","avelã","gergelim","linhaca","linhaça",
  "chia","coco","leite","queijo","ovo","frango","carne","peixe","salmao",
  "salmão","atum","sardinha","camarao","camarão","porco","boi","peru",
  "pao","pão","macarrao","macarrão","farinha","acucar","açúcar","mel",
  "azeite","oleo","óleo","manteiga","iogurte","creme","ricota","mucarela",
  "muçarela","mussarela","presunto","bacon","baroa","inglesa","doce",
  "branca","branco","roxo","roxa","preta","preto","carioca","fradinho",
  "jalo","rajado","rosinha","vermelho","integral","polido",
]);

function tokens(v: string): string[] {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

async function main() {
  const rows = await p.baseAlimento.findMany({
    select: { id: true, nome: true, nomeExibicao: true },
    orderBy: { id: "asc" },
  });

  const conector: typeof rows = [];
  const alimento: typeof rows = [];
  const detalhe: Record<number, string[]> = {};

  for (const r of rows) {
    const orig = tokens(r.nome ?? "");
    const atual = new Set(tokens(r.nomeExibicao ?? ""));
    if (!orig.length) continue;

    const perdidos = orig.filter((t) => !atual.has(t));
    if (!perdidos.length) continue;

    const c = perdidos.filter((t) => CONECTORES.has(t));
    const a = perdidos.filter((t) => ALIMENTOS.has(t));

    if (a.length) {
      alimento.push(r);
      detalhe[r.id] = a;
    } else if (c.length) {
      conector.push(r);
      detalhe[r.id] = c;
    }
  }

  console.log(`Total na base: ${rows.length}\n`);
  console.log(`Perdeu ALIMENTO/qualificador: ${alimento.length}`);
  console.log(`Perdeu CONECTOR:              ${conector.length}`);
  console.log(`Total a reparar:              ${alimento.length + conector.length}\n`);

  console.log("--- perdeu ALIMENTO (prioridade) ---");
  for (const r of alimento.slice(0, 40)) {
    console.log(`#${r.id}  [${detalhe[r.id].join(", ")}]`);
    console.log(`   original: "${r.nome}"`);
    console.log(`   atual:    "${r.nomeExibicao}"`);
  }

  const linhas = ["id;perdeu;nome_original;nome_atual"];
  for (const r of alimento) linhas.push(`${r.id};${detalhe[r.id].join("|")};${r.nome};${r.nomeExibicao}`);
  for (const r of conector) linhas.push(`${r.id};${detalhe[r.id].join("|")};${r.nome};${r.nomeExibicao}`);

  writeFileSync("auditoria-nomes.csv", linhas.join("\n"), "utf8");
  console.log(`\nCSV: auditoria-nomes.csv (${linhas.length - 1} linhas)`);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });