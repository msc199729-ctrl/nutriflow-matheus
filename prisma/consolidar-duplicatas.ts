import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

/**
 * Mapa: apagar → manter
 * A chave é o ID que será APAGADO, o valor é o ID que será MANTIDO.
 */
const CONSOLIDAR: Record<number, number> = {
  3359: 11435, // Banana nanica (legado) → Banana nanica (novo)
  276: 11434, // Banana prata (USADO - migrar antes) → Banana prata (novo)
  925: 11436, // Maçã com casca (legado) → Maçã com casca (novo)
  4287: 11431, // Pão francês trigo branco → Pão francês
  785: 11431, // Pão francês com requeijão → Pão francês
};

async function main() {
  const idsApagar = Object.keys(CONSOLIDAR).map(Number);

  console.log("=== FASE 1: MIGRAR ITENS ===\n");

  let migrados = 0;
  for (const idApagar of idsApagar) {
    const idManter = CONSOLIDAR[idApagar];

    const itens = await p.itemDieta.findMany({
      where: { idAlimento: idApagar },
      select: {
        id: true,
        quantidadeGramas: true,
        idMedidaCaseira: true,
        quantidadeMedida: true,
        medidaCaseira: true,
      },
    });

    if (itens.length === 0) {
      console.log(`✅ ${idApagar} → ${idManter}: nenhum item, pode apagar direto`);
      continue;
    }

    console.log(`⚠️  ${idApagar} → ${idManter}: ${itens.length} item(ns) para migrar`);

    const manter = await p.baseAlimento.findUnique({
      where: { id: idManter },
      select: {
        nome: true,
        nomeExibicao: true,
        medidasCaseiras: { orderBy: [{ padrao: "desc" }, { ordem: "asc" }] },
      },
    });

    if (!manter) {
      console.log(`  ❌ Destino ${idManter} não existe — PULANDO\n`);
      continue;
    }

    const nomeManter = manter.nomeExibicao ?? manter.nome;

    for (const it of itens) {
      const medidaOriginal = it.idMedidaCaseira
        ? await p.medidaCaseira.findUnique({
            where: { id: it.idMedidaCaseira },
            select: { nome: true, gramas: true },
          })
        : null;

      const medidaDestino = medidaOriginal
        ? (manter.medidasCaseiras.find((m) => m.nome === medidaOriginal.nome) ??
          manter.medidasCaseiras.find((m) => /unidade|concha|colher/i.test(m.nome)))
        : manter.medidasCaseiras[0];

      const gramas = Number(it.quantidadeGramas ?? 0);
      const qtdMedida =
        medidaDestino && Number(medidaDestino.gramas) > 0
          ? gramas / Number(medidaDestino.gramas)
          : null;

      await p.itemDieta.update({
        where: { id: it.id },
        data: {
          idAlimento: idManter,
          idMedidaCaseira: medidaDestino?.id ?? null,
          quantidadeMedida: qtdMedida,
          medidaCaseira: medidaDestino
            ? qtdMedida === 1
              ? `1 ${medidaDestino.nome}`
              : `${qtdMedida?.toFixed(2).replace(".", ",")} ${medidaDestino.nome}`
            : null,
        },
      });

      migrados++;
      console.log(`  ✅ ItemDieta ${it.id} migrado para "${nomeManter}" (${gramas}g)`);
    }
    console.log("");
  }

  console.log(`\n=== MIGRADOS: ${migrados} ===\n`);

  console.log("=== FASE 2: APAGAR DUPLICATAS ===\n");

  for (const idApagar of idsApagar) {
    const aindaUsado = await p.itemDieta.count({
      where: { idAlimento: idApagar },
    });
    if (aindaUsado > 0) {
      console.log(`⚠️  ${idApagar} AINDA tem ${aindaUsado} item(ns) — NÃO apagado`);
      continue;
    }

    await p.medidaCaseira.deleteMany({ where: { alimentoId: idApagar } });
    await p.baseAlimento.delete({ where: { id: idApagar } });
    console.log(`🗑️  ${idApagar} apagado`);
  }

  console.log("\n✅ Consolidação concluída.");
  await p.$disconnect();
}

main();