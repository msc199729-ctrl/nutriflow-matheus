import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

/**
 * Mapa cru → cozido.
 * fatorHidratacao = gramas de COZIDO por grama de CRU (preserva macros).
 * Leguminosas: 2,3–2,5 (TACO/USDA). Feijão preto: 2,4.
 */
const MAPA_CRU_COZIDO: Record<
  number,
  { idCozido: number; fatorHidratacao: number }
> = {
  5426: { idCozido: 11424, fatorHidratacao: 2.4 },
};

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
  const idsCrus = Object.keys(MAPA_CRU_COZIDO).map(Number);

  console.log("=== BUSCANDO ITENS COM ALIMENTO CRU ===\n");

  const itens = await p.itemDieta.findMany({
    where: { idAlimento: { in: idsCrus } },
    include: {
      alimento: { select: { id: true, nome: true, nomeExibicao: true } },
      medidaRef: { select: { nome: true, gramas: true } },
      refeicaoPlanejada: {
        select: {
          id: true,
          nome: true,
          planoAlimentar: { select: { id: true, nome: true } },
        },
      },
    },
  });

  if (itens.length === 0) {
    console.log("Nenhum item usa alimento cru do mapa. Nada a fazer.");
    await p.$disconnect();
    return;
  }

  console.log(`${itens.length} item(ns) encontrado(s):\n`);

  let apagados = 0;
  let recriados = 0;
  let pulados = 0;

  for (const it of itens) {
    const cfg = MAPA_CRU_COZIDO[it.idAlimento];
    const nomeCru = it.alimento.nomeExibicao ?? it.alimento.nome;
    const gramasCrus = Number(it.quantidadeGramas ?? 0);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`ItemDieta ${it.id} — ${nomeCru}`);
    console.log(
      `  Refeição: ${it.refeicaoPlanejada.nome} | Plano: ${it.refeicaoPlanejada.planoAlimentar?.nome ?? "—"}`,
    );
    console.log(`  Hoje: ${gramasCrus}g crus`);

    if (!Number.isFinite(gramasCrus) || gramasCrus <= 0) {
      console.log("  ⚠️  Sem gramas registradas — PULANDO\n");
      pulados++;
      continue;
    }

    const cozido = await p.baseAlimento.findUnique({
      where: { id: cfg.idCozido },
      select: {
        id: true,
        nome: true,
        nomeExibicao: true,
        medidasCaseiras: { orderBy: [{ padrao: "desc" }, { ordem: "asc" }] },
      },
    });

    if (!cozido) {
      console.log(`  ❌ Cozido ${cfg.idCozido} não existe — PULANDO\n`);
      pulados++;
      continue;
    }

    const nomeCozido = cozido.nomeExibicao ?? cozido.nome;

    const medida =
      cozido.medidasCaseiras.find((m) => /concha|colher/i.test(m.nome)) ??
      cozido.medidasCaseiras.find((m) => !/gramas/i.test(m.nome)) ??
      cozido.medidasCaseiras[0];

    if (!medida) {
      console.log(`  ⚠️  ${nomeCozido} sem medida caseira — PULANDO\n`);
      pulados++;
      continue;
    }

    // ── Conversão por hidratação (preserva macros) ──
    const gramasMedida = Number(medida.gramas);
    if (!Number.isFinite(gramasMedida) || gramasMedida <= 0) {
      console.log("  ⚠️  Medida com gramagem inválida — PULANDO\n");
      pulados++;
      continue;
    }

    const gramasCozido = gramasCrus * cfg.fatorHidratacao;
    const qtdBruta = gramasCozido / gramasMedida;
    const qtdFinal = arredondar(qtdBruta);
    const gramasFinais = Math.round(qtdFinal * gramasMedida * 10) / 10;
    const texto = textoMedida(qtdFinal, medida.nome);

    console.log(`  → ${nomeCozido}`);
    console.log(
      `    ${gramasCrus}g cru × ${cfg.fatorHidratacao} = ${gramasCozido.toFixed(1)}g cozido`,
    );
    console.log(
      `    ${gramasCozido.toFixed(1)}g ÷ ${gramasMedida}g = ${qtdBruta.toFixed(2)} → ${texto} (${gramasFinais}g)`,
    );

    await p.itemDieta.delete({ where: { id: it.id } });
    apagados++;
    console.log(`  🗑️  Item ${it.id} apagado`);

    const novo = await p.itemDieta.create({
      data: {
        idRefeicaoPlanejada: it.idRefeicaoPlanejada,
        idAlimento: cfg.idCozido,
        idMedidaCaseira: medida.id,
        quantidadeMedida: qtdFinal,
        quantidadeGramas: gramasFinais,
        medidaCaseira: texto,
        aVontade: it.aVontade,
        idGrupoSubstituicao: it.idGrupoSubstituicao,
      },
    });
    recriados++;
    console.log(`  ✅ Novo item ${novo.id} criado\n`);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("=== RESUMO ===");
  console.log(`Apagados: ${apagados}`);
  console.log(`Recriados: ${recriados}`);
  console.log(`Pulados: ${pulados}`);
  await p.$disconnect();
}

main();