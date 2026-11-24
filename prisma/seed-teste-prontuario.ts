import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./db-url";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const LIMPAR = args.includes("--limpar");
const DIAS = Number(opt("dias") ?? 14);
const BASE_PACIENTE = Number(opt("base") ?? 7);
const EMAIL_TESTE = "teste.crossfit@nutriflow.local";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function diaAtras(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function hora(y: Date, h: number, m = 0): Date {
  const d = new Date(y);
  d.setHours(h, m, 0, 0);
  return d;
}

// ---------- alimentos ----------
type AlimentoSeed = {
  nome: string;
  aliases: string[];
  kcal: number; prot: number; carb: number; gord: number; fib: number; sod: number;
};

const ALIMENTOS: AlimentoSeed[] = [
  { nome: "Pão francês", aliases: ["pao frances", "pão francês", "pao de sal"], kcal: 300, prot: 8, carb: 58.6, gord: 3.1, fib: 2.3, sod: 648 },
  { nome: "Ovo de galinha cozido", aliases: ["ovo cozido", "ovo de galinha", "ovos"], kcal: 146, prot: 13.3, carb: 0.6, gord: 9.5, fib: 0, sod: 146 },
  { nome: "Banana prata", aliases: ["banana", "banana prata", "banana nanica"], kcal: 98, prot: 1.3, carb: 26, gord: 0.1, fib: 2, sod: 1 },
  { nome: "Leite integral", aliases: ["leite", "leite integral", "leite de vaca"], kcal: 61, prot: 2.9, carb: 4.3, gord: 3.2, fib: 0, sod: 44 },
  { nome: "Arroz branco cozido", aliases: ["arroz", "arroz branco", "arroz cozido"], kcal: 128, prot: 2.5, carb: 28.1, gord: 0.2, fib: 1.6, sod: 1 },
  { nome: "Feijão carioca cozido", aliases: ["feijao", "feijão", "feijao carioca"], kcal: 76, prot: 4.8, carb: 13.6, gord: 0.5, fib: 8.5, sod: 2 },
  { nome: "Peito de frango grelhado", aliases: ["frango", "peito de frango", "file de frango", "filé de frango"], kcal: 159, prot: 32, carb: 0, gord: 2.5, fib: 0, sod: 50 },
  { nome: "Azeite de oliva extra virgem", aliases: ["azeite", "azeite de oliva", "óleo de oliva"], kcal: 884, prot: 0, carb: 0, gord: 100, fib: 0, sod: 2 },
  { nome: "Batata-doce cozida", aliases: ["batata doce", "batata-doce", "batata doce cozida"], kcal: 77, prot: 0.6, carb: 18.4, gord: 0.1, fib: 2.2, sod: 17 },
  { nome: "Aveia em flocos", aliases: ["aveia", "aveia em flocos", "flocos de aveia"], kcal: 394, prot: 13.9, carb: 66.6, gord: 8.5, fib: 9.1, sod: 5 },
  { nome: "Iogurte natural integral", aliases: ["iogurte", "iogurte natural", "iogurte integral"], kcal: 51, prot: 4.1, carb: 1.9, gord: 3.1, fib: 0, sod: 52 },
  { nome: "Mamão papaia", aliases: ["mamao", "mamão", "mamao papaia"], kcal: 40, prot: 0.5, carb: 10.4, gord: 0.1, fib: 1, sod: 3 },
  { nome: "Brócolis cozido", aliases: ["brocolis", "brócolis", "brocolis cozido"], kcal: 25, prot: 2.1, carb: 4.4, gord: 0.5, fib: 3.4, sod: 5 },
  { nome: "Macarrão cozido", aliases: ["macarrao", "macarrão", "massa", "macarrao cozido"], kcal: 158, prot: 5.8, carb: 30.9, gord: 0.9, fib: 1.8, sod: 7 },
  { nome: "Carne bovina cozida", aliases: ["carne", "carne bovina", "patinho", "coxao mole"], kcal: 217, prot: 32, carb: 0, gord: 9.5, fib: 0, sod: 60 },
  { nome: "Whey protein concentrado", aliases: ["whey", "whey protein", "proteina do soro"], kcal: 380, prot: 78, carb: 6, gord: 4, fib: 0, sod: 200 },
  { nome: "Pasta de amendoim", aliases: ["pasta de amendoim", "amendoim", "manteiga de amendoim"], kcal: 588, prot: 25, carb: 20, gord: 50, fib: 6, sod: 15 },
  { nome: "Salada de folhas", aliases: ["alface", "salada", "folhas", "alface crespa"], kcal: 15, prot: 1.4, carb: 2.9, gord: 0.2, fib: 1.3, sod: 4 },
];

type AlimentoMapa = Map<string, number>;

async function resolverAlimentos(): Promise<AlimentoMapa> {
  const mapa: AlimentoMapa = new Map();
  const todos = await prisma.baseAlimento.findMany({
    select: { id: true, nome: true, nomeBusca: true },
  });

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const usados = new Set<number>();

  for (const al of ALIMENTOS) {
    const alvos = al.aliases.map(norm);

    // 1) nome exato
    let achado = todos.find((e) => {
      const n = norm(e.nome ?? "");
      return alvos.includes(n) && !usados.has(e.id);
    });

    // 2) nome contém, mas só se ainda não foi usado
    if (!achado) {
      achado = todos.find((e) => {
        const n = norm(e.nome ?? "");
        const nb = norm(e.nomeBusca ?? "");
        return (
          !usados.has(e.id) &&
          alvos.some((a) => n.includes(a) || nb.includes(a)) &&
          n.length < 40
        );
      });
    }

    if (achado) {
      usados.add(achado.id);
      mapa.set(al.nome, achado.id);
      console.log(`  ${al.nome} -> #${achado.id} "${achado.nome}"`);
    } else {
      const novo = await prisma.baseAlimento.create({
        data: {
          nome: al.nome,
          nomeExibicao: al.nome,
          nomeBusca: norm(al.nome),
          fonte: "seed-teste",
          calorias: al.kcal,
          proteinas: al.prot,
          carboidratos: al.carb,
          gorduras: al.gord,
          fibras: al.fib,
          sodio: al.sod,
        },
      });
      usados.add(novo.id);
      mapa.set(al.nome, novo.id);
      console.log(`  ${al.nome} -> #${novo.id} (criado)`);
    }
  }

  return mapa;
}

function id(mapa: AlimentoMapa, nome: string): number {
  const v = mapa.get(nome);
  if (!v) throw new Error(`Alimento não resolvido: ${nome}`);
  return v;
}

// ---------- plano de 6 refeições ----------
type ItemPlano = { nome: string; gramas: number };

const REFEICOES: { nome: string; hora: number; min: number; itens: ItemPlano[] }[] = [
  {
    nome: "Café da manhã",
    hora: 6,
    min: 30,
    itens: [
      { nome: "Pão francês", gramas: 100 },
      { nome: "Ovo de galinha cozido", gramas: 100 },
      { nome: "Banana prata", gramas: 120 },
      { nome: "Leite integral", gramas: 200 },
    ],
  },
  {
    nome: "Almoço",
    hora: 11,
    min: 30,
    itens: [
      { nome: "Arroz branco cozido", gramas: 200 },
      { nome: "Feijão carioca cozido", gramas: 140 },
      { nome: "Peito de frango grelhado", gramas: 180 },
      { nome: "Brócolis cozido", gramas: 100 },
      { nome: "Salada de folhas", gramas: 80 },
      { nome: "Azeite de oliva extra virgem", gramas: 10 },
    ],
  },
  {
    nome: "Lanche da tarde",
    hora: 15,
    min: 0,
    itens: [
      { nome: "Iogurte natural integral", gramas: 170 },
      { nome: "Aveia em flocos", gramas: 40 },
      { nome: "Mamão papaia", gramas: 150 },
    ],
  },
  {
    nome: "Pré-treino",
    hora: 17,
    min: 0,
    itens: [
      { nome: "Batata-doce cozida", gramas: 200 },
      { nome: "Banana prata", gramas: 100 },
      { nome: "Pasta de amendoim", gramas: 15 },
    ],
  },
  {
    nome: "Pós-treino",
    hora: 19,
    min: 30,
    itens: [
      { nome: "Whey protein concentrado", gramas: 35 },
      { nome: "Banana prata", gramas: 100 },
    ],
  },
  {
    nome: "Jantar",
    hora: 21,
    min: 0,
    itens: [
      { nome: "Macarrão cozido", gramas: 180 },
      { nome: "Carne bovina cozida", gramas: 150 },
      { nome: "Brócolis cozido", gramas: 100 },
      { nome: "Azeite de oliva extra virgem", gramas: 8 },
    ],
  },
];

// ---------- avaliações ----------
const AVALIACOES = [
  { atras: 14, peso: 84.6, pg: 18.2, dobras: 78.4, cintura: 86.2, quadril: 100.4, braco: 37.4 },
  { atras: 7,  peso: 84.1, pg: 17.6, dobras: 74.1, cintura: 85.1, quadril: 100.0, braco: 37.8 },
  { atras: 0,  peso: 83.5, pg: 17.1, dobras: 70.2, cintura: 84.0, quadril: 99.6, braco: 38.2 },
];

const METAS = [
  { titulo: "Manter peso na faixa de performance", tipo: "peso", valorAlvo: 84, unidade: "kg", prazo: 90, concluida: false },
  { titulo: "Reduzir percentual de gordura para 16%", tipo: "percentual_gordura", valorAlvo: 16, unidade: "%", prazo: 90, concluida: false },
  { titulo: "Hidratação diária 3,5 L", tipo: "agua", valorAlvo: 3.5, unidade: "L/dia", prazo: 30, concluida: true },
  { titulo: "Proteína diária 2,0 g/kg", tipo: "proteina", valorAlvo: 168, unidade: "g", prazo: 30, concluida: false },
  { titulo: "5 sessões de Crossfit por semana", tipo: "frequencia", valorAlvo: 5, unidade: "sessoes", prazo: 30, concluida: false },
  { titulo: "Corrida: 10 km abaixo de 50 min", tipo: "performance", valorAlvo: 50, unidade: "min", prazo: 90, concluida: false },
];

const TREINOS = [
  { atras: 13, tipo: "Crossfit - WOD Metcon", dur: 60, int: "Alta", obs: "WOD 20min AMRAP: 5 pull-ups, 10 push-ups, 15 air squats. 11 rounds completos." },
  { atras: 12, tipo: "Corrida - Zona 2", dur: 45, int: "Baixa", obs: "45min contínuos, FC média 141 bpm, pace 5:50/km." },
  { atras: 11, tipo: "Crossfit - Força (Front Squat)", dur: 70, int: "Alta", obs: "Front squat 5x5 @ 95kg. Boa profundidade, sem dor lombar." },
  { atras: 10, tipo: "Crossfit - WOD Gymnastics", dur: 55, int: "Média", obs: "EMOM 20min: 3 muscle-ups + 12 double-unders. Escalado para 6 pull-ups." },
  { atras: 9,  tipo: "Descanso ativo - Mobilidade", dur: 30, int: "Baixa", obs: "Mobilidade de quadril e ombro, foam roller." },
  { atras: 8,  tipo: "Crossfit - WOD Cardio", dur: 50, int: "Alta", obs: "5 rounds: 400m run + 20 kettlebell swings 24kg." },
  { atras: 7,  tipo: "Corrida - Intervalado", dur: 40, int: "Muito alta", obs: "6x800m @ 4:20/km com 2min de recuperação. Última série em 4:10." },
  { atras: 6,  tipo: "Crossfit - Força (Deadlift)", dur: 65, int: "Alta", obs: "Deadlift 5x5 @ 130kg. Pegada firme, técnica mantida até a última série." },
  { atras: 5,  tipo: "Crossfit - WOD Longo", dur: 75, int: "Alta", obs: "Partner WOD 30min: 100 burpees + 200m farmer walk 32kg." },
  { atras: 4,  tipo: "Descanso ativo - Caminhada", dur: 40, int: "Baixa", obs: "Caminhada 4 km, ritmo confortável." },
  { atras: 3,  tipo: "Crossfit - Oly Lifting", dur: 70, int: "Alta", obs: "Snatch técnica + Clean & Jerk 4x3 @ 70kg." },
  { atras: 2,  tipo: "Corrida - Longo", dur: 60, int: "Média", obs: "60min contínuos, pace 5:35/km, sensação boa nos últimos 15min." },
  { atras: 1,  tipo: "Crossfit - WOD Metcon", dur: 55, int: "Alta", obs: "WOD 15min AMRAP: 10 box jumps + 10 wall balls + 10 toes to bar. 9 rounds." },
  { atras: 0,  tipo: "Descanso ativo - Mobilidade", dur: 30, int: "Baixa", obs: "Mobilidade de tornozelo e quadril, foco em recuperação." },
];

const ANAMNESE = {
  queixaPrincipal:
    "Atleta de Crossfit e corredor amador busca otimizar composição corporal e performance. Relata queda de rendimento nos WODs longos e dificuldade de recuperação entre sessões.",
  historiaDoencaAtual:
    "Pratica Crossfit há 3 anos, 5 a 6 sessões por semana, e corre 2 a 3 vezes por semana (10 km em média). Nos últimos 2 meses percebeu fadiga mais prolongada após WODs metabólicos e leve queda de carga nos levantamentos. Sem dor articular incapacitante.",
  patologias:
    "Nenhuma doença crônica diagnosticada. Episódio isolado de tendinite patelar em 2024, resolvido com fisioterapia.",
  medicamentos: "Nenhum uso contínuo.",
  suplementos:
    "Whey protein (1 dose pós-treino), creatina monohidratada 5 g/dia (uso irregular), cafeína pré-treino eventual.",
  alergias: "Nega alergias alimentares.",
  intolerancias: "Relata desconforto com leite em grande volume — tolera até 200 mL.",
  historicoFamiliar:
    "Pai com hipertensão arterial e diabetes tipo 2. Mãe com dislipidemia. Sem histórico de doença cardiovascular precoce.",
  habitosAlimentares:
    "Faz 4 a 5 refeições por dia, com maior volume no jantar. Pula o café da manhã 2 a 3 vezes por semana em dias de treino matinal. Consumo de ultraprocessados moderado (1 a 2 por semana). Baixa ingestão de vegetais no fim de semana.",
  restricoesAlimentares: "Nenhuma restrição ética ou religiosa.",
  frequenciaAlimentar:
    "Café da manhã 3 a 5x/semana; almoço diário; lanche da tarde 4x/semana; pré e pós-treino irregulares; jantar diário.",
  ingestaoHidrica: "Aproximadamente 2,0 a 2,5 L/dia, insuficiente para o volume de treino.",
  funcionamentoIntestinal: "1 evacuação por dia, consistência normal, sem uso de laxantes.",
  qualidadeSono: "6 a 7 horas por noite, com despertar noturno ocasional. Sonolência diurna leve.",
  atividadeFisica:
    "Crossfit 5 a 6x/semana (60 a 75 min por sessão), corrida 2 a 3x/semana (40 a 60 min). Total aproximado de 9 a 11 horas semanais de treino.",
  nivelEstresse: "Moderado — rotina de trabalho intensa em escritório, 9 horas por dia.",
  tabagismo: "Nega tabagismo.",
  etilismo: "Consumo social, 1 a 2 doses de álcool por semana.",
  observacoes:
    "Prioridades definidas em conjunto: (1) aumentar consistência do café da manhã em dias de treino matinal; (2) elevar ingestão hídrica com sódio em WODs acima de 60 min; (3) melhorar timing de carboidrato no pré-treino; (4) regularizar creatina em uso diário contínuo.",
};

const EXAME_LABORATORIAL = `EXAME LABORATORIAL — 12/11/2026
Laboratório: Laboratório Central — Coleta em jejum de 10 horas

HEMOGRAMA
Hemoglobina ............. 15,1 g/dL        (ref. 13,5–17,5)
Hematócrito ............. 44,8 %           (ref. 41–53)
Leucócitos .............. 6.240 /mm³       (ref. 4.000–11.000)
Plaquetas ............... 268.000 /mm³     (ref. 150.000–450.000)

METABOLISMO GLICÍDICO
Glicemia de jejum ....... 89 mg/dL         (ref. < 100)
Hemoglobina glicada ..... 5,1 %            (ref. < 5,7)
Insulina basal .......... 5,4 µUI/mL       (ref. 2,6–24,9)
HOMA-IR ................. 1,19             (ref. < 2,7)

PERFIL LIPÍDICO
Colesterol total ........ 178 mg/dL        (ref. < 190)
HDL colesterol .......... 62 mg/dL         (ref. > 40)
LDL colesterol .......... 101 mg/dL        (ref. < 130)
Triglicerídeos .......... 74 mg/dL         (ref. < 150)
CT/HDL .................. 2,87             (ref. < 4,5)

FUNÇÃO HEPÁTICA
TGO (AST) ............... 34 U/L           (ref. até 40)
TGP (ALT) ............... 41 U/L           (ref. até 41)
Gama-GT ................. 28 U/L           (ref. até 60)

FUNÇÃO RENAL
Creatinina .............. 1,02 mg/dL       (ref. 0,7–1,3)
Ureia ................... 38 mg/dL         (ref. 15–45)
TFG estimada ............ > 90 mL/min/1,73m²

MARCADORES DE FERRO
Ferritina ............... 94 ng/mL         (ref. 30–400)
Ferro sérico ............ 108 µg/dL        (ref. 65–175)

VITAMINAS E MINERAIS
Vitamina D (25-OH) ...... 38 ng/mL         (ref. > 30)
Vitamina B12 ............ 412 pg/mL        (ref. 200–900)
Ácido fólico ............ 9,8 ng/mL        (ref. 3,0–17,0)
Zinco ................... 88 µg/dL         (ref. 70–120)
Magnésio sérico ......... 2,1 mg/dL        (ref. 1,7–2,4)

HORMONAL
TSH ..................... 2,14 µUI/mL      (ref. 0,4–4,0)
T4 livre ................ 1,18 ng/dL       (ref. 0,8–1,8)
Testosterona total ...... 612 ng/dL        (ref. 264–916)
Cortisol matinal ........ 17,4 µg/dL       (ref. 6,2–19,4)

CREATINA QUINASE
CK total ................ 428 U/L          (ref. até 200)
CK-MB ................... 14 U/L           (ref. até 25)

INTERPRETAÇÃO
Perfil metabólico e lipídico dentro da normalidade, com HDL elevado (fator protetor).
CK total elevado é compatível com volume de treino intenso recente — não indica lesão.
Vitamina D e ferritina em faixa funcional, sem necessidade de suplementação imediata.
TGP no limite superior da referência: monitorar, sem restrição de treino.
TGO/TGP levemente elevados podem refletir treino de força recente.`;

const ORIENTACOES = `ORIENTAÇÕES NUTRICIONAIS INDIVIDUALIZADAS
Paciente: atleta de Crossfit + corrida amadora | Objetivo: performance com recomposição corporal

1. ESTRATÉGIA CALÓRICA
Manutenção calórica com leve déficit controlado (cerca de 200 kcal), priorizando
disponibilidade energética para treino. Alvo aproximado: 3.100 a 3.200 kcal/dia,
distribuídas em 6 refeições. Carboidrato como nutriente prioritário em torno de
45 a 50% do valor calórico total.

2. CROSSFIT — TIMING DE CARBOIDRATO
WODs metabólicos (metcon, AMRAP, EMOM longo) esgotam glicogênio muscular com
frequência. O pré-treino da tarde deve trazer 60 a 80 g de carboidrato de
digestão média (batata-doce, banana) com 3 horas de antecedência.
Nos dias de WOD acima de 25 minutos, adicionar 30 g de carboidrato de rápida
absorção 30 a 45 minutos antes. Após o treino, 35 g de whey + 40 a 60 g de
carboidrato nas 2 horas seguintes maximizam a ressíntese de glicogênio.

3. CORRIDA — PERIODIZAÇÃO
Sessões de zona 2 dispensam carga extra de carboidrato. Treinos intervalados e
corridas longas acima de 60 minutos exigem 60 g de carboidrato por hora, em
formato líquido ou gel, com 300 a 500 mg de sódio por hora.
Nunca iniciar corrida longa em jejum — o custo de recuperação é maior que o
benefício teórico do treino glicolítico em atleta amador.

4. PROTEÍNA
Alvo de 2,0 g/kg/dia (aproximadamente 168 g), distribuída em 30 a 40 g por
refeição. Proteína no café da manhã é prioridade: reduz fome tardia e melhora
a síntese proteica muscular ao longo do dia.

5. SUPLEMENTAÇÃO BASEADA EM EVIDÊNCIA
Creatina monohidratada: 5 g/dia, todos os dias, sem necessidade de fase de
saturação. É o suplemento com maior suporte científico para força e potência.
Whey protein: conveniência para atingir a meta proteica, não obrigatório se a
dieta já cobre. Cafeína: 3 a 6 mg/kg (200 a 350 mg) 45 a 60 minutos antes de
WODs de alta intensidade. Evitar após 14h para preservar o sono.
Beta-alanina: opcional, 3,2 a 6,4 g/dia divididos em doses, útil em esforços
de 1 a 4 minutos. Pode causar parestesia transitória.
Vitamina D: manter 1.000 a 2.000 UI/dia conforme exposição solar.

6. HIDRATAÇÃO
Meta: 3,5 L/dia. Em dias de treino duplo, 4,0 L.
WODs acima de 60 minutos ou em calor: adicionar 500 a 700 mg de sódio por litro.
Monitorar cor da urina (amarelo claro) e perda de peso pós-treino — cada 1 kg
perdido equivale a 1,0 a 1,5 L de reposição.

7. RECUPERAÇÃO E SONO
Sono é o fator com maior impacto na recuperação percebida. Meta de 7 a 8 horas.
Refeição noturna com carboidrato e proteína (jantar) favorece recuperação.
Álcool social deve ser evitado nas 24h após WODs de alta carga.

8. ADESÃO
Foco em três hábitos nas primeiras 4 semanas: café da manhã consistente em dias
de treino matinal, garrafa de água de 1 L sempre à vista, e creatina junto do
café da manhã. Os demais ajustes entram na reavaliação de 30 dias.`;

// ---------- main ----------
async function main() {
  // limpeza
  const existente = await prisma.usuario.findFirst({ where: { email: EMAIL_TESTE } });

  if (LIMPAR) {
    if (!existente) {
      console.log(`Nenhum paciente de teste encontrado (${EMAIL_TESTE}).`);
      await prisma.$disconnect();
      return;
    }
    const pid = existente.id;
    const rd = await prisma.registroDiario.deleteMany({ where: { idPaciente: pid } });
    const af = await prisma.avaliacaoFisica.deleteMany({ where: { idPaciente: pid } });
    const mt = await prisma.meta.deleteMany({ where: { idPaciente: pid } });
    const tr = await prisma.treino.deleteMany({ where: { idPaciente: pid } });
    const an = await prisma.anamnese.deleteMany({ where: { idPaciente: pid } });
    const nc = await prisma.notaClinica.deleteMany({ where: { idPaciente: pid } });
    const ef = await prisma.envioFormulario.deleteMany({ where: { idPaciente: pid } });
    const pl = await prisma.planoAlimentar.findMany({ where: { idPaciente: pid }, select: { id: true } });
    for (const p of pl) {
      await prisma.refeicaoPlanejada.deleteMany({ where: { idPlanoAlimentar: p.id } });
      await prisma.planoAlimentar.deleteMany({ where: { id: p.id } });
    }
    const pa = await prisma.paciente.deleteMany({ where: { id: pid } });
    await prisma.usuario.deleteMany({ where: { id: pid } });

    console.log(`\nPaciente de teste removido (id ${pid}):`);
    console.log(`  registros: ${rd.count} | avaliacoes: ${af.count} | metas: ${mt.count} | treinos: ${tr.count}`);
    console.log(`  anamnese: ${an.count} | notas: ${nc.count} | envios: ${ef.count} | planos: ${pa.count}`);
    await prisma.$disconnect();
    return;
  }

  if (existente) {
    throw new Error(
      `Já existe paciente de teste (id ${existente.id}). Rode com --limpar antes de recriar.`,
    );
  }

  // base: paciente existente para clonar usuario
  const base = await prisma.paciente.findUnique({
    where: { id: BASE_PACIENTE },
    include: { usuario: true },
  });
  if (!base) throw new Error(`Paciente base ${BASE_PACIENTE} não encontrado`);

  console.log(`\nBase para clonagem: paciente ${base.id} (${base.nome ?? "sem nome"})`);

  const { id: _ignore, ...restoUsuario } = base.usuario as any;
  const novoUsuario = await prisma.usuario.create({
    data: {
      ...restoUsuario,
      email: EMAIL_TESTE,
    },
  });

  const paciente = await prisma.paciente.create({
    data: {
      id: novoUsuario.id,
      workspaceId: base.workspaceId,
      idNutricionista: base.idNutricionista,
      nome: "Paciente Teste Crossfit",
      cpf: "00000000191",
      celular: "(11) 99999-0001",
      dataNascimento: new Date("1994-03-18"),
      genero: "masculino",
      objetivo: "Performance em Crossfit e corrida com recomposição corporal",
      notasClinicas: ANAMNESE.observacoes,
    },
  });

  console.log(`Paciente de teste criado: id ${paciente.id} — ${paciente.nome}`);

  // ---------- alimentos ----------
  const mapa = await resolverAlimentos();

  // ---------- plano de 6 refeições ----------
  const plano = await prisma.planoAlimentar.create({
        data: {
      paciente: { connect: { id: paciente.id } },
      nutricionista: { connect: { id: base.idNutricionista } },
      nome: "Plano Performance Crossfit — 6 refeições",
      tipoPlano: "POR_ALIMENTOS",
      descricaoQualitativa:
        "Plano de manutenção calórica com carboidrato alto para atleta de Crossfit e corrida. Seis refeições com ênfase em timing de carboidrato peri-treino e distribuição proteica de 30 a 40 g por refeição.",
      metaAguaLitros: 3.5,
      refeicoesPlanejadas: {
        create: REFEICOES.map((r) => ({
          nome: r.nome,
          horarioSugerido: hora(diaAtras(0), r.hora, r.min),
          itensDieta: {
            create: r.itens.map((it) => ({
              idAlimento: id(mapa, it.nome),
              quantidadeGramas: it.gramas,
              aVontade: false,
            })),
          },
        })),
      },
    },
    include: {
      refeicoesPlanejadas: { include: { itensDieta: true } },
    },
  });

  const totalItensPlano = plano.refeicoesPlanejadas.reduce((s, r) => s + r.itensDieta.length, 0);
  console.log(`Plano criado: id ${plano.id} — ${plano.refeicoesPlanejadas.length} refeições, ${totalItensPlano} itens`);

  // ---------- anamnese ----------
  await prisma.anamnese.create({
    data: { idPaciente: paciente.id, data: diaAtras(14), ...ANAMNESE },
  });

  // ---------- notas clínicas (exame + orientações) ----------
  const idAutor = base.idNutricionista;
  await prisma.notaClinica.create({
    data: { idPaciente: paciente.id, idAutor, tipo: "exame", conteudo: EXAME_LABORATORIAL, criadoEm: diaAtras(7) },
  });
  await prisma.notaClinica.create({
    data: { idPaciente: paciente.id, idAutor, tipo: "orientacao", conteudo: ORIENTACOES, criadoEm: diaAtras(14) },
  });

  // ---------- avaliações físicas ----------
  const ALTURA = 1.79;
  for (const a of AVALIACOES) {
    const massaGordura = r1((a.peso * a.pg) / 100);
    const mlg = r1(a.peso - massaGordura);
    const imc = r2(a.peso / (ALTURA * ALTURA));
    await prisma.avaliacaoFisica.create({
      data: {
        idPaciente: paciente.id,
        data: diaAtras(a.atras),
        peso: a.peso,
        altura: ALTURA,
        imc,
        classificacaoImc: imc < 25 ? "Eutrofia" : "Sobrepeso",
        percentualGordura: a.pg,
        classificacaoGordura: a.pg < 20 ? "Atletica" : "Media",
        massaGorduraKg: massaGordura,
        massaLivreGorduraKg: mlg,
        massaResidualKg: r1(a.peso * 0.243),
        massaMuscularKg: r1(mlg * 0.53),
        protocoloGordura: "Pollock 7 dobras",
        somatorioDobrasMm: a.dobras,
        dobraTricipital: r1(a.dobras * 0.12),
        dobraBicipital: r1(a.dobras * 0.07),
        dobraSubescapular: r1(a.dobras * 0.15),
        dobraAxilarMedia: r1(a.dobras * 0.10),
        dobraToracica: r1(a.dobras * 0.12),
        dobraAbdominal: r1(a.dobras * 0.18),
        dobraSuprailiaca: r1(a.dobras * 0.14),
        dobraCoxa: r1(a.dobras * 0.12),
        circPescoco: 39.0,
        circOmbro: 119.5,
        circTorax: 102.0,
        circCintura: a.cintura,
        circAbdomen: r1(a.cintura + 1.8),
        circQuadril: a.quadril,
        circBracoDirRelaxado: r1(a.braco - 1.2),
        circBracoEsqRelaxado: r1(a.braco - 1.4),
        circBracoDirContraido: a.braco,
        circBracoEsqContraido: r1(a.braco - 0.5),
        circCoxaProximalDir: 60.8,
        circCoxaProximalEsq: 60.4,
        circCoxaMedialDir: 56.2,
        circCoxaMedialEsq: 55.9,
        circPanturrilhaDir: 38.9,
        circPanturrilhaEsq: 38.6,
      },
    });
  }

  // ---------- metas ----------
  for (const m of METAS) {
    await prisma.meta.create({
      data: {
        idPaciente: paciente.id,
        titulo: m.titulo,
        tipo: m.tipo,
        valorAlvo: m.valorAlvo,
        unidade: m.unidade,
        prazo: diaAtras(-m.prazo),
        concluida: m.concluida,
      },
    });
  }

  // ---------- treinos ----------
  for (const t of TREINOS) {
    await prisma.treino.create({
      data: {
        idPaciente: paciente.id,
        data: diaAtras(t.atras),
        tipo: t.tipo,
        duracaoMin: t.dur,
        intensidade: t.int,
        observacoes: t.obs,
      },
    });
  }

  // ---------- registros diários (evolução) ----------
  let totalReg = 0;
  let totalConsumidos = 0;

  for (let d = DIAS - 1; d >= 0; d--) {
    const progresso = (DIAS - 1 - d) / Math.max(1, DIAS - 1);
    const dia = diaAtras(d);
    const agua = Math.round(2700 + progresso * 900 + (Math.random() - 0.5) * 350);
    const sono = r1(6.6 + progresso * 1.1 + (Math.random() - 0.5) * 0.7);
    const peso = r1(84.6 - progresso * 1.1 + (Math.random() - 0.5) * 0.5);

    for (const ref of REFEICOES) {
      const adesao = 0.72 + progresso * 0.24;
      if (Math.random() > adesao) continue;

      const registradoEm = hora(dia, ref.hora, ref.min + Math.floor(Math.random() * 20));

      const registro = await prisma.registroDiario.create({
        data: {
          idPaciente: paciente.id,
          registradoEm,
          tipoRefeicao: ref.nome,
          ingestaoAguaMl: ref.nome === "Pré-treino" || ref.nome === "Pós-treino" ? agua : null,
          horasSono: ref.nome === "Café da manhã" ? sono : null,
          pesoKg: ref.nome === "Café da manhã" ? peso : null,
        },
      });
      totalReg++;

      const fator = r1(0.8 + Math.random() * 0.25);
      for (const it of ref.itens) {
        if (Math.random() > 0.9) continue;
        await prisma.itemConsumido.create({
          data: {
            idRegistro: registro.id,
            idAlimento: id(mapa, it.nome),
            quantidadeConsumida: r1(it.gramas * fator),
            origem: "busca_manual",
          },
        });
        totalConsumidos++;
      }
    }
  }

  // ---------- formulário ----------
  const perguntaDefs = [
    { texto: "Como você avalia sua energia durante os treinos nesta semana?", tipo: "escala", opcoes: null },
    { texto: "Quantas sessões de Crossfit você completou?", tipo: "numero", opcoes: null },
    { texto: "Como está sua recuperação entre sessões?", tipo: "multipla_escolha", opcoes: ["Ótima", "Boa", "Regular", "Ruim"] },
    { texto: "Você seguiu o plano alimentar nos dias de treino?", tipo: "multipla_escolha", opcoes: ["Sempre", "Na maioria", "Às vezes", "Raramente"] },
    { texto: "Como está sua hidratação diária?", tipo: "multipla_escolha", opcoes: ["Acima de 3,5 L", "Entre 2,5 e 3,5 L", "Entre 1,5 e 2,5 L", "Abaixo de 1,5 L"] },
    { texto: "Alguma dificuldade ou desconforto a relatar?", tipo: "texto", opcoes: null },
  ];

  const modelo = await prisma.modeloFormulario.create({
    data: {
      workspaceId: base.workspaceId,
      titulo: "Check-in semanal — Performance Crossfit",
      frequenciaDias: 7,
      perguntas: {
        create: perguntaDefs.map((p) => ({
          textoPergunta: p.texto,
          tipoResposta: p.tipo,
          opcoesJson: p.opcoes ? (p.opcoes as any) : undefined,
          obrigatoria: true,
        })),
      },
    },
    include: { perguntas: true },
  });

  const respostasPorSemana = [
    { atras: 7, valores: ["7", "5", "Boa", "Na maioria", "Entre 2,5 e 3,5 L", "Cansaço no WOD de sexta, mas nada limitante."] },
    { atras: 0, valores: ["8", "5", "Ótima", "Sempre", "Acima de 3,5 L", "Sem desconforto. Melhorei o pace na corrida de domingo."] },
  ];

  for (const r of respostasPorSemana) {
    const envio = await prisma.envioFormulario.create({
      data: {
        idPaciente: paciente.id,
        idModelo: modelo.id,
        enviadoEm: diaAtras(r.atras + 1),
        respondidoEm: diaAtras(r.atras),
        status: "respondido",
      },
    });
    for (let i = 0; i < modelo.perguntas.length; i++) {
      await prisma.resposta.create({
        data: {
          idEnvio: envio.id,
          idPergunta: modelo.perguntas[i].id,
          valorResposta: r.valores[i] ?? null,
        },
      });
    }
  }

  console.log(`\n=== PRONTUÁRIO GERADO (paciente ${paciente.id}) ===`);
  console.log(`  plano:              ${plano.refeicoesPlanejadas.length} refeições / ${totalItensPlano} itens`);
  console.log(`  anamnese:           1`);
  console.log(`  notas clínicas:     2 (exame + orientações)`);
  console.log(`  avaliações físicas: ${AVALIACOES.length}`);
  console.log(`  metas:              ${METAS.length}`);
  console.log(`  treinos:            ${TREINOS.length}`);
  console.log(`  registros diários:  ${totalReg}`);
  console.log(`  itens consumidos:   ${totalConsumidos}`);
  console.log(`  formulários:        ${respostasPorSemana.length} envios / ${modelo.perguntas.length} perguntas`);
  console.log(`\nPara desfazer: npx tsx prisma/seed-teste-prontuario.ts --limpar`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

