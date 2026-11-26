/**
 * PDF do plano alimentar — versão completa para entrega ao paciente.
 *
 * Rota (DocumentosController):
 *   GET /documentos/plano-alimentar/:idPlano/pdf
 *
 * Estrutura (inspirada no que o WebDiet faz bem, com o que ele faz mal resolvido):
 *
 *  1. RESUMO — calorias e macros do dia em 4 caixas + "Como usar este plano"
 *     + timeline das refeições com kcal e macros de cada uma
 *     + hidratação com equivalência em copos.
 *
 *  2. PLANEJAMENTO — uma seção por refeição: faixa de título com horário,
 *     itens com medida caseira à direita, substitutos indentados com "ou"
 *     e rodapé com os macros da refeição.
 *
 *  3. MICRONUTRIENTES — grade de cards com valor, barra e % da DRI do paciente,
 *     com legenda de cores ANTES da grade.
 *
 *  4. LISTA DE COMPRAS — agrupada por categoria, com checkbox, quantidade
 *     total do período e alternativas marcadas com "ou".
 *
 * O TIMBRE vem da conta logada (ProfissionalService): nome, titulação,
 * conselho, cidade, logo e Instagram são de quem emite, não do código.
 *
 * Compliance CFN (Res. 599/2018 e 856/2026): é a prescrição, não material de
 * divulgação — sem promessa de resultado, sem antes/depois.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { TipoPlano } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PacientesService } from '../pacientes/pacientes.service';
import { idadeEmAnos } from '../physical-evaluations/physical-evaluations-calc.service';
import {
  agregarNutrientes,
  NUTRIENTES,
  type AlimentoNutrientes,
  type ContextoDri,
  type ItemPlano,
} from '../micronutrientes/micronutrientes';
import { ProfissionalService, type PerfilProfissional } from './profissional.service';

// ── Geometria ────────────────────────────────────────────────────────
const W = 595.28;
const H = 841.89;
const ME = 48;
const MD = 48;
const MSUP = 132;
const MSUP_CONT = 96;
const MINF = 62;
const UTIL = W - ME - MD;

// ── Paleta ───────────────────────────────────────────────────────────
const AZUL = '#123a63';
const AZUL_MED = '#2b5b8c';
const AZUL_CLARO = '#eaf1f8';
const TEAL = '#0f9488';
const TEAL_CLARO = '#e6f5f3';
const TEXTO = '#1b2430';
const SUAVE = '#6b7785';
const LINHA = '#e3e8ee';
const AMBAR = '#b45309';
const VERDE = '#15803d';
const VERMELHO = '#b91c1c';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function dataExtenso(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Colunas `@db.Date` e `@db.Time` chegam do driver como meia-noite UTC.
 * Ler com a API local desloca o valor em fusos negativos — um plano "24/11"
 * viraria "23/11" e "08:00" viraria "05:00". Por isso estas leem em UTC.
 */
function dataCurta(d: Date | null): string {
  if (!d) return '';
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

function horaDe(h: Date | null): string {
  if (!h) return '';
  const hh = String(h.getUTCHours()).padStart(2, '0');
  const mm = String(h.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function n1(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.round(v * 10) / 10;
}

/** Número no padrão brasileiro, sem zeros inúteis. */
function fmt(v: number | null | undefined, casas = 1): string {
  const n = n1(v);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(casas).replace('.', ',');
}

interface ItemPdf {
  nome: string;
  medida: string;
  gramas: number;
  aVontade: boolean;
  substitutos: Array<{ nome: string; medida: string }>;
}

interface RefeicaoPdf {
  nome: string;
  horario: string;
  itens: ItemPdf[];
  kcal: number;
  ptn: number;
  cho: number;
  lip: number;
}

interface CompraItem {
  nome: string;
  quantidade: string;
  alternativas: string[];
}

interface CompraGrupo {
  categoria: string;
  itens: CompraItem[];
}

interface DadosPdf {
  profissional: PerfilProfissional;
  paciente: string;
  nomePlano: string;
  tipoPlano: string;
  vigencia: string;
  metaAgua: number;
  refeicoes: RefeicaoPdf[];
  totais: { kcal: number; ptn: number; cho: number; lip: number };
  micros: Array<{ rotulo: string; valor: string; percentual: number }>;
  compras: CompraGrupo[];
  microsIncompletos: boolean;
}

/** Medida caseira legível: "3 unidades", "2 fatias", senão gramas. */
function medidaLegivel(item: {
  medidaRef?: { nome: string } | null;
  medidaCaseira?: string | null;
  quantidadeMedida?: number | null;
  quantidadeGramas?: number | null;
  aVontade?: boolean;
}): string {
  if (item.aVontade) return 'à vontade';
  const qtd = item.quantidadeMedida;
  if (item.medidaRef?.nome && qtd && qtd > 0) {
    const nome = item.medidaRef.nome;
    const plural = qtd > 1 && !nome.toLowerCase().endsWith('s') ? `${nome}s` : nome;
    return `${fmt(qtd)} ${plural}`;
  }
  if (item.medidaCaseira?.trim()) return item.medidaCaseira.trim();
  const g = n1(item.quantidadeGramas);
  return g > 0 ? `${fmt(g)} g` : 'à vontade';
}

/** Categoria amigável da lista de compras a partir da classe da TBCA. */
const CATEGORIAS: Array<{ teste: RegExp; rotulo: string }> = [
  { teste: /carne|ave|pescado|peixe|fruto do mar|ovo/i, rotulo: 'Proteínas' },
  { teste: /cereal|gr[aã]o|tub[eé]rculo|raiz|p[aã]o|massa/i, rotulo: 'Cereais e tubérculos' },
  { teste: /leite|derivado|queijo|iogurte|laticínio/i, rotulo: 'Leite e derivados' },
  { teste: /fruta/i, rotulo: 'Frutas' },
  { teste: /vegetal|legume|verdura|hortali/i, rotulo: 'Vegetais' },
  { teste: /leguminosa/i, rotulo: 'Leguminosas' },
  { teste: /g[oó]rdur|oleaginos|semente|castanha|azeite|[oó]leo/i, rotulo: 'Gorduras e sementes' },
  { teste: /bebida|suco|ch[aá]|caf[eé]/i, rotulo: 'Bebidas' },
  { teste: /a[cç][uú]car|doce|mel|sobremesa/i, rotulo: 'Açúcares e doces' },
];

function categoriaDe(classe: string | null): string {
  if (!classe) return 'Outros';
  for (const c of CATEGORIAS) if (c.teste.test(classe)) return c.rotulo;
  return 'Outros';
}

const ORDEM_CATEGORIAS = [
  'Proteínas',
  'Cereais e tubérculos',
  'Leguminosas',
  'Vegetais',
  'Frutas',
  'Leite e derivados',
  'Gorduras e sementes',
  'Bebidas',
  'Açúcares e doces',
  'Outros',
];

@Injectable()
export class PlanoPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pacientesService: PacientesService,
    private readonly profissionalService: ProfissionalService,
  ) {}

  // ═══════════════════ DADOS ═══════════════════

  async carregarPlano(idPlano: number, user: JwtPayloadUser): Promise<DadosPdf> {
    const profissional = await this.profissionalService.doUsuario(user);

    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id: idPlano },
      select: {
        id: true,
        nome: true,
        tipoPlano: true,
        descricaoQualitativa: true,
        dataInicio: true,
        dataFim: true,
        metaAguaLitros: true,
        idPaciente: true,
        paciente: { select: { nome: true, dataNascimento: true, genero: true } },
        refeicoesPlanejadas: {
          orderBy: { horarioSugerido: 'asc' },
          select: {
            nome: true,
            horarioSugerido: true,
            itensDieta: {
              orderBy: { id: 'asc' },
              select: {
                idAlimento: true,
                quantidadeGramas: true,
                medidaCaseira: true,
                quantidadeMedida: true,
                aVontade: true,
                medidaRef: { select: { nome: true } },
                alimento: {
                  select: {
                    id: true,
                    nome: true,
                    nomeExibicao: true,
                    classeTbca: true,
                    calorias: true,
                    proteinas: true,
                    carboidratos: true,
                    gorduras: true,
                    calcio: true, ferro: true, magnesio: true, fosforo: true,
                    potassio: true, zinco: true, cobre: true, selenio: true,
                    vitaminaARae: true, vitaminaC: true, vitaminaD: true, vitaminaE: true,
                    tiamina: true, vitaminaB2: true, vitaminaB3: true, vitaminaB6: true,
                    vitaminaB12: true, folato: true,
                    gorduraSaturada: true, gorduraMonoinsaturada: true,
                    gorduraPoliinsaturada: true, gorduraTrans: true, colesterol: true,
                  },
                },
                substitutos: {
                  orderBy: { ordem: 'asc' },
                  select: {
                    quantidadeGramas: true,
                    alimento: { select: { nome: true, nomeExibicao: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);

    // ── Refeições, macros e itens ──
    const refeicoes: RefeicaoPdf[] = [];
    const itensMicro: ItemPlano[] = [];
    const alimentosMicro = new Map<number, AlimentoNutrientes>();
    const comprasMap = new Map<
      string,
      Map<string, { gramas: number; aVontade: boolean; alternativas: Set<string> }>
    >();

    for (const ref of plano.refeicoesPlanejadas) {
      const r: RefeicaoPdf = {
        nome: ref.nome ?? 'Refeição',
        horario: horaDe(ref.horarioSugerido),
        itens: [],
        kcal: 0, ptn: 0, cho: 0, lip: 0,
      };

      for (const it of ref.itensDieta) {
        const a = it.alimento;
        const g = n1(it.quantidadeGramas);
        const fator = g / 100;

        r.itens.push({
          nome: a.nomeExibicao || a.nome,
          medida: medidaLegivel(it),
          gramas: g,
          aVontade: it.aVontade,
          substitutos: (it.substitutos ?? []).map((s) => ({
            nome: s.alimento.nomeExibicao || s.alimento.nome,
            medida: medidaLegivel({ quantidadeGramas: s.quantidadeGramas }),
          })),
        });

        // Macros: só os itens principais (o paciente consome uma opção por vez)
        if (!it.aVontade && g > 0) {
          r.kcal += (a.calorias ?? 0) * fator;
          r.ptn += (a.proteinas ?? 0) * fator;
          r.cho += (a.carboidratos ?? 0) * fator;
          r.lip += (a.gorduras ?? 0) * fator;
        }

        // Micronutrientes
        itensMicro.push({
          idAlimento: it.idAlimento,
          quantidadeGramas: g,
          aVontade: it.aVontade,
        });
        if (!alimentosMicro.has(a.id)) {
          const micros: Record<string, number | null> = {};
          for (const def of NUTRIENTES) {
            const v = (a as unknown as Record<string, unknown>)[def.campoPrisma];
            micros[def.chave] = typeof v === 'number' ? v : null;
          }
          alimentosMicro.set(a.id, {
            id: a.id,
            nome: a.nome,
            nomeExibicao: a.nomeExibicao,
            calorias: a.calorias,
            micros,
          });
        }

        // Lista de compras: quantidade total do período
        const cat = categoriaDe(a.classeTbca);
        if (!comprasMap.has(cat)) comprasMap.set(cat, new Map());
        const grupo = comprasMap.get(cat)!;
        const chave = (a.nomeExibicao || a.nome).trim();
        const existente = grupo.get(chave) ?? {
          gramas: 0,
          aVontade: false,
          alternativas: new Set<string>(),
        };
        existente.gramas += g;
        if (it.aVontade) existente.aVontade = true;
        for (const s of it.substitutos ?? []) {
          existente.alternativas.add(
            `${s.alimento.nomeExibicao || s.alimento.nome} ${fmt(s.quantidadeGramas)} g`,
          );
        }
        grupo.set(chave, existente);
      }

      r.kcal = Math.round(r.kcal);
      r.ptn = n1(r.ptn);
      r.cho = n1(r.cho);
      r.lip = n1(r.lip);
      refeicoes.push(r);
    }

    const totais = {
      kcal: refeicoes.reduce((s, r) => s + r.kcal, 0),
      ptn: n1(refeicoes.reduce((s, r) => s + r.ptn, 0)),
      cho: n1(refeicoes.reduce((s, r) => s + r.cho, 0)),
      lip: n1(refeicoes.reduce((s, r) => s + r.lip, 0)),
    };

    // ── Micronutrientes contra a DRI do paciente ──
    const ctx: ContextoDri = {
      sexo: String(plano.paciente.genero ?? '').toUpperCase().startsWith('F') ? 'F' : 'M',
      // Sem data de nascimento, assume adulto (30) para não perder a referência.
      idadeAnos: idadeEmAnos(plano.paciente.dataNascimento) ?? 30,
    };
    const resultadoMicro = agregarNutrientes(itensMicro, alimentosMicro, ctx);
    const micros = resultadoMicro.totais.map((t) => ({
      rotulo: t.rotulo,
      valor: `${fmt(t.prescrito)} ${t.unidade}`,
      percentual: t.percentual ?? 0,
    }));

    // ── Lista de compras ──
    const compras: CompraGrupo[] = [];
    for (const cat of ORDEM_CATEGORIAS) {
      const grupo = comprasMap.get(cat);
      if (!grupo || grupo.size === 0) continue;
      const itens: CompraItem[] = [...grupo.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        .map(([nome, v]) => ({
          nome,
          quantidade: v.aVontade
            ? 'à vontade'
            : v.gramas >= 1000
              ? `${fmt(v.gramas / 1000, 2)} kg`
              : `${Math.round(v.gramas)} g`,
          alternativas: [...v.alternativas],
        }));
      compras.push({ categoria: cat, itens });
    }

    const vigencia =
      plano.dataInicio
        ? `${dataCurta(plano.dataInicio)}${plano.dataFim ? ` – ${dataCurta(plano.dataFim)}` : ''}`
        : '';

    return {
      profissional,
      paciente: plano.paciente.nome?.trim() || 'Paciente',
      nomePlano: plano.nome ?? `Plano alimentar #${plano.id}`,
      tipoPlano: plano.tipoPlano === TipoPlano.QUALITATIVO ? 'Qualitativo' : 'Por alimentos',
      vigencia,
      metaAgua: n1(plano.metaAguaLitros),
      refeicoes,
      totais,
      micros,
      compras,
      microsIncompletos: resultadoMicro.cobertura.alimentosSemDados.length > 0,
    };
  }

  // ═══════════════════ RENDER ═══════════════════

  gerar(d: DadosPdf): PDFKit.PDFDocument {
    const prof = d.profissional;
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MSUP, bottom: MINF, left: ME, right: MD },
      bufferPages: true,
      info: { Title: `Plano alimentar — ${d.paciente}` },
    });

    /**
     * Logo do nutricionista, se ele enviou um. Caminho local (upload em
     * /uploads/timbre/) ou URL http(s). Falha de leitura nunca quebra o
     * documento: cai no cabeçalho só texto.
     */
    const logo = carregarLogo(prof.logoUrl);
    const temLogo = logo !== null;
    // Com logo à esquerda, o texto desloca para não colidir.
    const nivelTexto = temLogo ? 58 : 0;

    const topo = (pagina1: boolean) => {
      const alt = pagina1 ? 96 : 62;
      doc.save();
      doc.rect(0, 0, W, alt).fill(AZUL);
      doc.rect(0, alt, W, 3.5).fill(pagina1 ? TEAL : AZUL_MED);
      doc.restore();

      if (temLogo && logo) {
        const boxH = pagina1 ? 40 : 28;
        const boxW = pagina1 ? 110 : 78;
        try {
          doc.image(logo, ME, (alt - boxH) / 2, { fit: [boxW, boxH] });
        } catch {
          // imagem corrompida: segue sem logo
        }
      }

      doc.fillColor('#ffffff');
      doc.font('Helvetica-Bold').fontSize(pagina1 ? 15 : 11.5)
        .text((prof.nome ?? '').toUpperCase(), 0, pagina1 ? 26 : 18, {
          align: 'center', width: W - nivelTexto * 2,
        });
      if (pagina1) {
        doc.font('Helvetica').fontSize(9.5).fillColor('#bed0e4')
          .text(prof.especialidade, { align: 'center', width: W - nivelTexto * 2 });
        doc.font('Helvetica').fontSize(8.5).fillColor('#93aac6')
          .text(
            `${prof.conselhoTipo} ${prof.conselhoNumero}${prof.instagram ? `  ·  ${prof.instagram}` : ''}`,
            { align: 'center', width: W - nivelTexto * 2 },
          );
      } else {
        doc.font('Helvetica').fontSize(8).fillColor('#93aac6')
          .text(`${prof.conselhoTipo} ${prof.conselhoNumero}  ·  ${d.paciente}`, {
            align: 'center', width: W - nivelTexto * 2,
          });
      }
    };

    const novaPagina = (comTitulo?: string) => {
      doc.addPage();
      topo(false);
      doc.y = MSUP_CONT;
      doc.x = ME;
      if (comTitulo) {
        doc.font('Helvetica-Bold').fontSize(13).fillColor(AZUL)
          .text(comTitulo, ME, doc.y, { width: UTIL });
        doc.moveDown(0.9);
      }
    };

    // ══════════ 1. RESUMO ══════════
    topo(true);

    doc.font('Helvetica-Bold').fontSize(21).fillColor(TEXTO)
      .text('Plano Alimentar', ME, MSUP, { width: UTIL });
    doc.font('Helvetica').fontSize(10.5).fillColor(SUAVE)
      .text(`Preparado para ${d.paciente}`, ME, doc.y + 3, { width: UTIL });
    doc.moveDown(0.7);

    // chips
    const chips = [d.nomePlano, d.tipoPlano, d.vigencia].filter(Boolean);
    let cx = ME;
    const yChips = doc.y;
    doc.font('Helvetica').fontSize(8.5);
    for (const c of chips) {
      const l = doc.widthOfString(c) + 20;
      if (cx + l > ME + UTIL) break;
      doc.roundedRect(cx, yChips, l, 20, 10).fill(AZUL_CLARO);
      doc.fillColor(AZUL_MED)
        .text(c, cx + 10, yChips + 6, { width: l - 20, lineBreak: false });
      cx += l + 6;
    }
    doc.y = yChips + 30;
    doc.x = ME;

    // caixas de resumo
    const boxW = (UTIL - 18) / 4;
    const boxH = 54;
    const yBox = doc.y;
    const caixas = [
      { rot: 'CALORIAS / DIA', val: String(d.totais.kcal), uni: 'kcal' },
      { rot: 'PROTEÍNAS', val: fmt(d.totais.ptn), uni: 'g' },
      { rot: 'CARBOIDRATOS', val: fmt(d.totais.cho), uni: 'g' },
      { rot: 'GORDURAS', val: fmt(d.totais.lip), uni: 'g' },
    ];
    caixas.forEach((c, i) => {
      const x = ME + i * (boxW + 6);
      doc.roundedRect(x, yBox, boxW, boxH, 7).fill(AZUL_CLARO);
      doc.font('Helvetica').fontSize(6.5).fillColor(AZUL_MED)
        .text(c.rot, x, yBox + 9, { width: boxW, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(17).fillColor(AZUL)
        .text(c.val, x, yBox + 20, { width: boxW, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor(SUAVE)
        .text(c.uni, x, yBox + 40, { width: boxW, align: 'center' });
    });
    doc.y = yBox + boxH + 16;
    doc.x = ME;

    // como usar
    const instrucoes = [
      'Em cada refeição, escolha UMA opção: o item principal ou uma das alternativas marcadas com “ou”.',
      'Os horários são uma referência — ajuste conforme sua rotina, mantendo a ordem das refeições.',
      'As quantidades em gramas servem para conferir; no dia a dia, use a medida caseira.',
    ];
    doc.font('Helvetica').fontSize(8.5);
    let alturaComo = 26;
    for (const l of instrucoes) {
      alturaComo += doc.heightOfString(l, { width: UTIL - 40 }) + 3;
    }
    const yComo = doc.y;
    doc.roundedRect(ME, yComo, UTIL, alturaComo, 7).fill(TEAL_CLARO);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEAL)
      .text('Como usar este plano', ME + 14, yComo + 9, { width: UTIL - 28 });
    let yL = yComo + 22;
    for (const l of instrucoes) {
      doc.font('Helvetica').fontSize(8.5).fillColor(TEAL).text('•', ME + 14, yL, { width: 8 });
      doc.fillColor('#134e4a').text(l, ME + 24, yL, { width: UTIL - 40 });
      yL = doc.y + 3;
    }
    doc.y = yComo + alturaComo + 16;
    doc.x = ME;

    // timeline
    doc.font('Helvetica-Bold').fontSize(9).fillColor(SUAVE)
      .text('SUAS REFEIÇÕES', ME, doc.y, { width: UTIL, characterSpacing: 0.6 });
    doc.moveDown(0.6);

    for (const r of d.refeicoes) {
      if (doc.y > H - MINF - 44) novaPagina();
      const yy = doc.y;
      doc.roundedRect(ME, yy, UTIL, 30, 6).fill('#f7f9fc');
      doc.rect(ME, yy, 3, 30).fill(TEAL);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TEAL)
        .text(r.horario, ME + 12, yy + 10, { width: 44 });
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(AZUL)
        .text(r.nome, ME + 60, yy + 9.5, { width: UTIL - 200 });
      doc.font('Helvetica').fontSize(8).fillColor(SUAVE)
        .text(
          `${fmt(r.ptn)} P · ${fmt(r.cho)} C · ${fmt(r.lip)} G`,
          ME + UTIL - 180, yy + 10.5, { width: 120, align: 'right' },
        );
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(AZUL_MED)
        .text(`${r.kcal} kcal`, ME + UTIL - 54, yy + 10, { width: 46, align: 'right' });
      doc.y = yy + 34;
      doc.x = ME;
    }
    doc.moveDown(0.5);

    // hidratação
    if (d.metaAgua > 0) {
      const litrosTxt = d.metaAgua.toFixed(1).replace('.', ',');
      const copos = Math.round((d.metaAgua * 1000) / 300);
      const yAg = doc.y;
      doc.roundedRect(ME, yAg, UTIL, 34, 7).fill(AZUL_CLARO);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(AZUL)
        .text(`Hidratação: ${litrosTxt} litros por dia`, ME + 14, yAg + 8, { width: UTIL - 28 });
      doc.font('Helvetica').fontSize(8).fillColor(AZUL_MED)
        .text(
          `Equivale a cerca de ${copos} copos de 300 ml, distribuídos ao longo do dia.`,
          ME + 14, yAg + 21, { width: UTIL - 28 },
        );
      doc.y = yAg + 34;
      doc.x = ME;
    }

    // ══════════ 2. PLANEJAMENTO ══════════
    novaPagina('Planejamento das refeições');
    doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE)
      .text(
        'Quantidades por refeição. Itens marcados com “ou” são alternativas — escolha uma.',
        ME, doc.y, { width: UTIL },
      );
    doc.moveDown(1);

    /** Altura que a refeição vai ocupar (título + itens + rodapé de macros). */
    const alturaRefeicao = (r: RefeicaoPdf): number => {
      let h = 30 + 6;
      for (const it of r.itens) {
        doc.font('Helvetica').fontSize(10);
        const linhas = Math.max(
          1,
          Math.ceil(doc.widthOfString(it.nome) / (UTIL - 190)),
        );
        h += 9 + linhas * 12.5;
        h += it.substitutos.length * 13 + (it.substitutos.length ? 4 : 0);
      }
      return h + 20;
    };

    for (const r of d.refeicoes) {
      // Quebra só se a refeição INTEIRA não couber (evita refeição órfã no fim da página).
      const precisa = alturaRefeicao(r);
      const espaco = H - MINF - doc.y;
      if (precisa > espaco && precisa <= H - MINF - MSUP_CONT - 40) {
        novaPagina('Planejamento das refeições (continuação)');
      } else if (doc.y > H - MINF - 130) {
        novaPagina('Planejamento das refeições (continuação)');
      }

      const yF = doc.y;
      const altF = 30;
      doc.rect(ME, yF, UTIL, altF).fill(AZUL_CLARO);
      doc.rect(ME, yF, 4, altF).fill(TEAL);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(AZUL)
        .text(r.nome.toUpperCase(), ME + 15, yF + 9, { width: UTIL - 160 });
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TEAL)
        .text(r.horario, ME + UTIL - 70, yF + 9.5, { width: 56, align: 'right' });
      doc.y = yF + altF + 6;
      doc.x = ME;

      let zebra = false;
      for (const it of r.itens) {
        doc.font('Helvetica').fontSize(10);
        const linhasNome = Math.max(1, Math.ceil(doc.widthOfString(it.nome) / (UTIL - 190)));
        const altItem = 9 + linhasNome * 12.5;
        const altSub = it.substitutos.length * 13;
        const altTotal = altItem + altSub + (it.substitutos.length ? 4 : 0);

        if (doc.y + altTotal > H - MINF - 18) novaPagina('Planejamento das refeições (continuação)');

        const yI = doc.y;
        doc.rect(ME, yI, UTIL, altTotal).fill(zebra ? '#f7f9fc' : '#ffffff');

        doc.font('Helvetica').fontSize(10).fillColor(TEXTO)
          .text(it.nome, ME + 15, yI + 6, { width: UTIL - 190 });
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(AZUL_MED)
          .text(it.medida, ME + UTIL - 170, yI + 6.5, { width: 155, align: 'right' });

        let yS = yI + altItem;
        for (const s of it.substitutos) {
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(TEAL)
            .text('ou', ME + 28, yS + 1, { width: 14 });
          doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE)
            .text(`${s.nome} — ${s.medida}`, ME + 44, yS, { width: UTIL - 70 });
          yS = doc.y + 2;
        }

        doc.y = Math.max(yI + altTotal, doc.y);
        doc.x = ME;
        zebra = !zebra;
      }

      const yM = doc.y + 2;
      doc.moveTo(ME, yM).lineTo(ME + UTIL, yM).lineWidth(0.5).strokeColor(LINHA).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor(SUAVE)
        .text(
          `Proteínas ${fmt(r.ptn)} g   ·   Carboidratos ${fmt(r.cho)} g   ·   Gorduras ${fmt(r.lip)} g`,
          ME + 15, yM + 5, { width: UTIL - 110 },
        );
      doc.font('Helvetica-Bold').fontSize(8).fillColor(AZUL_MED)
        .text(`${r.kcal} kcal`, ME + UTIL - 80, yM + 4.5, { width: 68, align: 'right' });
      doc.y = yM + 20;
      doc.x = ME;
    }

    // ══════════ 3. MICRONUTRIENTES ══════════
    // Aproveita a página atual quando sobra espaço: uma refeição sozinha numa
    // página inteira é feio, e a grade de micros caberia logo abaixo dela.
    const espacoMicros = H - MINF - doc.y;
    if (espacoMicros >= 400) {
      doc.moveDown(1.4);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(AZUL)
        .text('Vitaminas, minerais e gorduras', ME, doc.y, { width: UTIL });
      doc.moveDown(0.5);
    } else {
      novaPagina('Vitaminas, minerais e gorduras');
    }
    doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE)
      .text(
        'Total do dia comparado com a recomendação para o seu perfil (DRI).',
        ME, doc.y, { width: UTIL },
      );
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(7).fillColor(SUAVE)
      .text(
        'Verde: atende ou supera a recomendação. Âmbar: entre 70% e 99%. Vermelho: abaixo de 70%. ' +
        'Gorduras não têm meta diária fixa — a referência é a proporção em relação às calorias do plano.',
        ME, doc.y, { width: UTIL, lineGap: 1.5 },
      );
    doc.moveDown(0.9);

    const COLS = 3;
    const gap = 7;
    const cw = (UTIL - gap * (COLS - 1)) / COLS;
    const ch = 34;
    let yGrade = doc.y;
    let col = 0;

    for (const m of d.micros) {
      if (col === 0 && yGrade + ch > H - MINF - 12) {
        novaPagina('Vitaminas, minerais e gorduras (continuação)');
        yGrade = doc.y;
      }
      const x = ME + col * (cw + gap);

      let corTxt = SUAVE;
      if (m.percentual >= 100) corTxt = VERDE;
      else if (m.percentual >= 70) corTxt = AMBAR;
      else if (m.percentual > 0) corTxt = VERMELHO;

      doc.roundedRect(x, yGrade, cw, ch, 5).fill('#fbfcfd');
      doc.roundedRect(x, yGrade, cw, ch, 5).lineWidth(0.6).strokeColor('#e9eef4').stroke();
      doc.font('Helvetica').fontSize(6.8).fillColor(SUAVE)
        .text(m.rotulo, x + 8, yGrade + 6, { width: cw - 24 });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXTO)
        .text(m.valor, x + 8, yGrade + 15, { width: cw - 16, lineBreak: false });
      if (m.percentual > 0) {
        doc.roundedRect(x + 8, yGrade + 26, cw - 16, 4, 2).fill('#eef2f6');
        const wBar = Math.max(2, Math.min(1, m.percentual / 120) * (cw - 16));
        doc.roundedRect(x + 8, yGrade + 26, wBar, 4, 2).fill(corTxt);
        doc.font('Helvetica').fontSize(6.5).fillColor(corTxt)
          .text(`${m.percentual}%`, x + cw - 33, yGrade + 17, { width: 25, align: 'right' });
      }

      col++;
      if (col >= COLS) {
        col = 0;
        yGrade += ch + gap;
      }
    }
    doc.y = yGrade + (col > 0 ? ch : 0) + 8;
    doc.x = ME;

    if (d.microsIncompletos) {
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(SUAVE)
        .text(
          'Alguns alimentos deste plano não têm informação de micronutrientes na base de dados, ' +
          'então o total pode estar subestimado.',
          ME, doc.y, { width: UTIL },
        );
    }

    // ══════════ 4. LISTA DE COMPRAS ══════════
    if (d.compras.length > 0) {
      novaPagina('Lista de compras');
      doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE)
        .text(
          'Quantidades totais do período do plano. Itens com “ou” são alternativas — compre uma.',
          ME, doc.y, { width: UTIL },
        );
      doc.moveDown(1);

      for (const g of d.compras) {
        if (doc.y > H - MINF - 70) novaPagina('Lista de compras (continuação)');
        doc.font('Helvetica-Bold').fontSize(8).fillColor(TEAL)
          .text(g.categoria.toUpperCase(), ME, doc.y, { width: UTIL, characterSpacing: 0.5 });
        doc.moveDown(0.45);

        for (const it of g.itens) {
          const alt = 15 + it.alternativas.length * 10;
          if (doc.y + alt > H - MINF - 10) novaPagina('Lista de compras (continuação)');
          const y = doc.y;
          doc.roundedRect(ME + 2, y + 2, 8, 8, 1.5)
            .lineWidth(0.8).strokeColor('#b6c2cf').stroke();
          doc.font('Helvetica').fontSize(9.5).fillColor(TEXTO)
            .text(it.nome, ME + 18, y, { width: UTIL - 140 });
          doc.font('Helvetica-Bold').fontSize(9).fillColor(AZUL_MED)
            .text(it.quantidade, ME + UTIL - 108, y + 0.5, { width: 103, align: 'right' });

          let yO = doc.y;
          for (const o of it.alternativas) {
            doc.font('Helvetica-Bold').fontSize(7).fillColor(TEAL)
              .text('ou', ME + 26, yO + 1, { width: 12 });
            doc.font('Helvetica').fontSize(8).fillColor(SUAVE)
              .text(o, ME + 40, yO, { width: UTIL - 62 });
            yO = doc.y + 1;
          }
          doc.y = Math.max(doc.y, y + alt - 3);
          doc.x = ME;
        }
        doc.moveDown(0.6);
      }
    }

    // ══════════ Nota + assinatura ══════════
    if (doc.y > H - MINF - 150) novaPagina();
    doc.moveDown(0.8);
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(SUAVE)
      .text(
        'Este plano é individualizado e foi elaborado a partir da sua avaliação nutricional. ' +
        'Não deve ser compartilhado ou seguido por terceiros.',
        ME, doc.y, { width: UTIL, align: 'justify', lineGap: 1.5 },
      );

    doc.moveDown(1.8);
    const localData = prof.cidade
      ? `${prof.cidade}, ${dataExtenso(new Date())}.`
      : `${dataExtenso(new Date())}.`;
    doc.font('Helvetica').fontSize(8.5).fillColor(SUAVE)
      .text(localData, ME, doc.y, { width: UTIL, align: 'center' });
    doc.moveDown(2.6);
    const yR = doc.y;
    doc.moveTo(W / 2 - 100, yR).lineTo(W / 2 + 100, yR)
      .lineWidth(0.7).strokeColor('#9aa7b4').stroke();
    doc.y = yR + 7;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXTO)
      .text(prof.nome, ME, doc.y, { width: UTIL, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(SUAVE)
      .text(
        `${prof.especialidade}  ·  ${prof.conselhoTipo} ${prof.conselhoNumero}`,
        ME, doc.y + 1, { width: UTIL, align: 'center' },
      );

    // ══════════ Rodapés ══════════
    doc.flushPages();
    const total = doc.bufferedPageRange().count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(i);
      const yF = H - 30;
      doc.moveTo(ME, yF - 12).lineTo(W - MD, yF - 12)
        .lineWidth(0.4).strokeColor(LINHA).stroke();
      doc.font('Helvetica').fontSize(7).fillColor(SUAVE)
        .text(
          `${(prof.nome ?? '').toUpperCase()}  ·  ${prof.conselhoTipo} ${prof.conselhoNumero}`,
          ME, yF - 7, { width: UTIL / 2 },
        );
      doc.text(`Página ${i + 1} de ${total}`, ME + UTIL / 2, yF - 7, {
        width: UTIL / 2, align: 'right',
      });
    }

    doc.end();
    return doc;
  }
}

/**
 * Resolve o logo do profissional para algo que o pdfkit aceite: caminho do
 * arquivo no disco ou URL absoluta. Devolve null quando não há logo ou quando
 * o arquivo não existe — o documento sai só com o texto.
 */
function carregarLogo(logoUrl: string | null): Buffer | string | null {
  if (!logoUrl?.trim()) return null;
  const alvo = logoUrl.trim();
  if (/^https?:\/\//i.test(alvo)) return alvo;
  const candidatos = [alvo, join(process.cwd(), alvo.replace(/^\/+/, ''))];
  for (const c of candidatos) {
    if (existsSync(c)) return c;
  }
  return null;
}
