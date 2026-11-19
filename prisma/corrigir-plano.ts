import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const PACIENTE_ID = 7;
const PLANO_CORRETO = 1;

async function main() {
  // 1. Ver os itens do plano 1 em detalhe
  const plano = await p.planoAlimentar.findUnique({
    where: { id: PLANO_CORRETO },
    include: {
      refeicoesPlanejadas: {
        include: {
          itensDieta: {
            include: {
              alimento: {
                select: {
                  id: true,
                  nome: true,
                  nomeExibicao: true,
                  calorias: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!plano) {
    console.log(`Plano ${PLANO_CORRETO} não existe.`);
    await p.$disconnect();
    return;
  }

  console.log(`=== PLANO ${PLANO_CORRETO} — ${plano.nome} ===\n`);

  for (const r of plano.refeicoesPlanejadas) {
    const h = r.horarioSugerido
      ? r.horarioSugerido.toISOString().slice(11, 16)
      : "—";
    console.log(`[${r.id}] ${r.nome} (${h}) — ${r.itensDieta.length} itens`);
    for (const it of r.itensDieta) {
      const nome = it.alimento.nomeExibicao ?? it.alimento.nome;
      console.log(
        `    [${it.id}] ${nome} — ${it.quantidadeGramas ?? 0}g — ${it.alimento.calorias ?? 0} kcal/100g`,
      );
    }
  }

  // 2. Detecta refeições duplicadas pelo nome base
  const nomes = plano.refeicoesPlanejadas.map((r) =>
    (r.nome ?? "").replace(/\s*\(cópia\)\s*/i, "").trim(),
  );
  const duplicadas: number[] = [];
  const vistos = new Map<string, number>();

  plano.refeicoesPlanejadas.forEach((r, i) => {
    const base = nomes[i];
    if (vistos.has(base)) {
      duplicadas.push(r.id);
    } else {
      vistos.set(base, r.id);
    }
  });

  if (duplicadas.length > 0) {
    console.log(
      `\n⚠️  ${duplicadas.length} refeição(ões) duplicada(s): ${duplicadas.join(", ")}`,
    );
    console.log(`\nPara remover, rode:`);
    console.log(
      `  npx tsx prisma\\corrigir-plano.ts --remover-duplicatas`,
    );
  }

  // 3. Executa correção se pedido
  if (process.argv.includes("--remover-duplicatas") && duplicadas.length > 0) {
    console.log(`\n🗑️  Removendo ${duplicadas.length} refeições duplicadas...`);
    await p.refeicaoPlanejada.deleteMany({ where: { id: { in: duplicadas } } });
    console.log(`✅ Removidas.`);
  }

  if (process.argv.includes("--ativar")) {
    console.log(`\n🔄 Ativando plano ${PLANO_CORRETO} e desativando outros...`);
    await p.planoAlimentar.updateMany({
      where: { idPaciente: PACIENTE_ID },
      data: { ativo: false },
    });
    await p.planoAlimentar.update({
      where: { id: PLANO_CORRETO },
      data: { ativo: true },
    });
    console.log(`✅ Plano ${PLANO_CORRETO} ativo, demais desativados.`);
  }

  await p.$disconnect();
}

main();