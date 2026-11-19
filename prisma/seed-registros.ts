import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const PACIENTE_ID = 7;
const PLANO_ID = 1;
const DIAS = 7;

const ADERENCIA: Record<string, number[]> = {
  cafe: [0.9, 1.0, 0.85, 1.0, 0.7, 1.0, 0.95],
  almoco: [0.7, 0.8, 0.6, 0.9, 0.5, 0.75, 0.7],
};

function classificar(nome: string): "cafe" | "almoco" | "outro" {
  const n = nome.toLowerCase();
  if (n.includes("café") || n.includes("cafe")) return "cafe";
  if (n.includes("almoço") || n.includes("almoco")) return "almoco";
  return "outro";
}

async function main() {
  if (process.argv.includes("--limpar")) {
    const del = await p.registroDiario.deleteMany({ where: { idPaciente: PACIENTE_ID } });
    console.log(`Registros deletados: ${del.count}`);
    await p.$disconnect();
    return;
  }

  const plano = await p.planoAlimentar.findUnique({
    where: { id: PLANO_ID },
    include: {
      refeicoesPlanejadas: {
        include: {
          itensDieta: { include: { alimento: { select: { id: true, nome: true, nomeExibicao: true } } } },
        },
      },
    },
  });

  if (!plano) throw new Error(`Plano ${PLANO_ID} nao encontrado`);

  console.log(`Plano ${PLANO_ID} — ${plano.refeicoesPlanejadas.length} refeicao(oes):\n`);

  for (const r of plano.refeicoesPlanejadas) {
    console.log(`  ${r.nome} [${classificar(r.nome ?? "")}] — ${r.itensDieta.length} itens`);
  }

  await p.registroDiario.deleteMany({ where: { idPaciente: PACIENTE_ID } });

  const hoje = new Date();
  let totalReg = 0;
  let totalItens = 0;

  for (let d = DIAS - 1; d >= 0; d--) {
    const dia = new Date(hoje);
    dia.setDate(hoje.getDate() - d);

    const agua = 2000 + Math.round((Math.random() - 0.3) * 800);
    const sono = Math.round((6.5 + Math.random() * 2) * 10) / 10;
    const peso = Math.round((84.5 + (Math.random() - 0.5)) * 10) / 10;

    for (const r of plano.refeicoesPlanejadas) {
      const tipo = classificar(r.nome ?? "");
      const tabela = ADERENCIA[tipo] ?? [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8];
      const fator = tabela[DIAS - 1 - d];

      const registradoEm = new Date(dia);
      registradoEm.setHours(tipo === "cafe" ? 8 : tipo === "almoco" ? 12 : 19, Math.floor(Math.random() * 30), 0, 0);

      const registro = await p.registroDiario.create({
        data: {
          idPaciente: PACIENTE_ID,
          registradoEm,
          tipoRefeicao: r.nome ?? "Refeicao",
          ingestaoAguaMl: agua,
          horasSono: sono,
          pesoKg: peso,
        },
      });
      totalReg++;

      for (const item of r.itensDieta) {
        const gramas = Math.round(Number(item.quantidadeGramas ?? 0) * fator * 10) / 10;
        if (gramas <= 0) continue;

        await p.itemConsumido.create({
          data: {
            idRegistro: registro.id,
            idAlimento: item.alimento.id,
            quantidadeConsumida: gramas,
            origem: "busca_manual",
          },
        });
        totalItens++;
      }
    }
  }

  console.log(`\nRegistros criados: ${totalReg}`);
  console.log(`Itens consumidos criados: ${totalItens}`);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
