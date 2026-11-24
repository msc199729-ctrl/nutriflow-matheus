/**
 * PDF timbrado do plano alimentar — entrega ao paciente.
 *
 * Rota (registrada no DocumentosController):
 *   GET /documentos/plano-alimentar/:idPlano/pdf   -> PDF inline
 *
 * Design (v2): faixa de topo full-bleed azul-marinho com nome/CRN em branco,
 * linha de acento teal, título do documento com chip de vigência, refeições
 * com faixa de título (borda esquerda teal + horário à direita), tabela com
 * zebra sutil, hidratação em destaque, bloco de assinatura e paginação.
 * Segue Res. CFN 599/2018 + 856/2026: sem promessa de resultado; é a
 * PRESCRIÇÃO, não material de divulgação.
 *
 * Logo: placeholder — quando o arquivo existir em assets/logo.png,
 * descomentar o bloco LOGO em desenharTopo().
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { PROFISSIONAL_PADRAO } from './documentos.config';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PacientesService } from '../pacientes/pacientes.service';

const LARGEMA4 = 595.28; // pt
const ALTURA_A4 = 841.89; // pt
const MARGEM_ESQ = 52;
const MARGEM_DIR = 52;
const MARGEM_SUP = 150; // abaixo da faixa de topo
const MARGEM_INF = 64;
const LARGEM_UTIL = LARGEMA4 - MARGEM_ESQ - MARGEM_DIR;

// Paleta
const AZUL = '#1e3a5f';        // marinho — timbre e títulos
const AZUL_CLARO = '#eef3f8';  // fundo de faixa de refeição e zebra
const TEAL = '#0d9488';        // acento
const TEXTO = '#1f2937';
const TEXTO_SUAVE = '#6b7280';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function dataExtenso(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function dataCurta(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('pt-BR');
}

function hora(h: Date | null): string {
  if (!h) return '';
  return h.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtG(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '';
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

/** Medida caseira do item: prioriza a medida cadastrada, senão a string antiga. */
function medidaDoItem(item: {
  medidaRef?: { nome: string } | null;
  medidaCaseira?: string | null;
  quantidadeMedida?: number | null;
  quantidadeGramas?: number | null;
}): string {
  const qtd = item.quantidadeMedida;
  if (item.medidaRef?.nome && qtd && qtd > 0) {
    const nome = item.medidaRef.nome.toLowerCase();
    const plural = qtd > 1 && !nome.endsWith('s') ? `${item.medidaRef.nome}s` : item.medidaRef.nome;
    return `${fmtG(qtd)} ${plural}`;
  }
  if (item.medidaCaseira?.trim() && item.quantidadeGramas && item.quantidadeGramas > 0) {
    return item.medidaCaseira.trim();
  }
  const g = fmtG(item.quantidadeGramas);
  return g ? `${g} g` : 'à vontade';
}

interface LinhaItem {
  nome: string;
  medida: string;
  substitutos: string[];
}

interface Refeicao {
  nome: string;
  horario: string;
  itens: LinhaItem[];
}

interface DadosPlano {
  nomePlano: string;
  paciente: string;
  tipoPlano: string;
  descricaoQualitativa: string | null;
  dataInicio: Date | null;
  dataFim: Date | null;
  metaAguaLitros: number | null;
  refeicoes: Refeicao[];
}

@Injectable()
export class PlanoPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pacientesService: PacientesService,
  ) {}

  async carregarPlano(idPlano: number, user: JwtPayloadUser): Promise<DadosPlano> {
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
        paciente: { select: { nome: true } },
        refeicoesPlanejadas: {
          orderBy: { horarioSugerido: 'asc' },
          select: {
            nome: true,
            horarioSugerido: true,
            itensDieta: {
              orderBy: { id: 'asc' },
              select: {
                quantidadeGramas: true,
                medidaCaseira: true,
                idMedidaCaseira: true,
                quantidadeMedida: true,
                aVontade: true,
                medidaRef: { select: { nome: true } },
                alimento: { select: { nome: true, nomeExibicao: true } },
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

    const refeicoes: Refeicao[] = plano.refeicoesPlanejadas.map((r) => ({
      nome: r.nome ?? 'Refeição',
      horario: hora(r.horarioSugerido),
      itens: r.itensDieta.map((it) => ({
        nome: it.alimento.nomeExibicao || it.alimento.nome,
        medida: it.aVontade ? 'à vontade' : medidaDoItem(it),
        substitutos: (it.substitutos ?? []).map((s) => {
          const g = fmtG(s.quantidadeGramas);
          const n = s.alimento.nomeExibicao || s.alimento.nome;
          return g ? `${n} (${g} g)` : n;
        }),
      })),
    }));

    return {
      nomePlano: plano.nome ?? `Plano alimentar #${plano.id}`,
      paciente: plano.paciente.nome?.trim() || 'Paciente',
      tipoPlano: plano.tipoPlano === 'QUALITATIVO' ? 'Qualitativo' : 'Por alimentos',
      descricaoQualitativa: plano.descricaoQualitativa,
      dataInicio: plano.dataInicio,
      dataFim: plano.dataFim,
      metaAguaLitros: plano.metaAguaLitros,
      refeicoes,
    };
  }

  /** Faixa de topo full-bleed, desenhada em TODAS as páginas. */
  private desenharTopo(doc: PDFKit.PDFDocument, pagina1: boolean): void {
    const prof = PROFISSIONAL_PADRAO;
    const alturaFaixa = pagina1 ? 108 : 84;

    doc.save();
    doc.rect(0, 0, LARGEMA4, alturaFaixa).fill(AZUL);
    doc.rect(0, alturaFaixa, LARGEMA4, 4).fill(pagina1 ? TEAL : AZUL);
    doc.restore();

    // LOGO: quando houver o arquivo, descomentar:
    // doc.image('assets/logo.png', MARGEM_ESQ, 26, { height: 56 });

    doc.fillColor('#ffffff');
    doc.font('Helvetica-Bold').fontSize(15)
      .text('NUTRICIONISTA MATHEUS S CARVALHO', 0, pagina1 ? 34 : 26, {
        align: 'center', width: LARGEMA4,
      });
    doc.font('Helvetica').fontSize(9.5).fillColor('#c7d5e8')
      .text('Nutrição Clínica Esportiva', { align: 'center', width: LARGEMA4 });
    doc.font('Helvetica').fontSize(8.5).fillColor('#9fb3cc')
      .text(`CRN ${prof.conselhoNumero}`, { align: 'center', width: LARGEMA4 });
  }

  gerar(dados: DadosPlano): PDFKit.PDFDocument {
    const prof = PROFISSIONAL_PADRAO;
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEM_SUP, bottom: MARGEM_INF, left: MARGEM_ESQ, right: MARGEM_DIR },
      info: { Title: `Plano alimentar — ${dados.paciente}` },
    });

    // ── Faixa de topo (página 1) ──────────────────────────────────────
    this.desenharTopo(doc, true);

    // ── Título do documento ───────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(20).fillColor(TEXTO)
      .text('Plano Alimentar', MARGEM_ESQ, MARGEM_SUP, { width: LARGEM_UTIL });
    doc.font('Helvetica').fontSize(10.5).fillColor(TEXTO_SUAVE)
      .text(`Preparado para ${dados.paciente}`, MARGEM_ESQ, doc.y + 4, { width: LARGEM_UTIL });
    doc.moveDown(0.8);

    // chip: nome do plano · tipo · vigência
    const vigencia = dados.dataInicio
      ? `${dataCurta(dados.dataInicio)}${dados.dataFim ? ` – ${dataCurta(dados.dataFim)}` : ''}`
      : null;
    const chip = [dados.nomePlano, dados.tipoPlano, vigencia].filter(Boolean).join('   ·   ');
    if (chip) {
      doc.font('Helvetica').fontSize(9);
      const larguraChip = doc.widthOfString(chip) + 24;
      const yChip = doc.y;
      doc.roundedRect(MARGEM_ESQ, yChip, Math.min(larguraChip, LARGEM_UTIL), 22, 11)
        .fill(AZUL_CLARO);
      doc.font('Helvetica').fontSize(9).fillColor(AZUL)
        .text(chip, MARGEM_ESQ + 12, yChip + 6.5, { width: LARGEM_UTIL - 24 });
      doc.y = yChip + 22;
    }
    doc.moveDown(1.2);

    // ── Corpo ─────────────────────────────────────────────────────────
    if (dados.tipoPlano === 'Qualitativo' && dados.descricaoQualitativa?.trim()) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXTO)
        .text('Orientações gerais');
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10).fillColor(TEXTO)
        .text(dados.descricaoQualitativa.trim(), { align: 'justify', lineGap: 3 });
      doc.moveDown(1.2);
    }

    for (const ref of dados.refeicoes) {
      // Quebra de página antes da refeição se não couber o título + 1 item
      if (doc.y > ALTURA_A4 - MARGEM_INF - 130) {
        doc.addPage();
        this.desenharTopo(doc, false);
        doc.y = MARGEM_SUP - 30;
      }

      // ── Faixa de título da refeição ──
      const yFaixa = doc.y;
      const alturaFaixa = 26;
      doc.rect(MARGEM_ESQ, yFaixa, LARGEM_UTIL, alturaFaixa).fill(AZUL_CLARO);
      doc.rect(MARGEM_ESQ, yFaixa, 4, alturaFaixa).fill(TEAL);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(AZUL)
        .text(ref.nome.toUpperCase(), MARGEM_ESQ + 14, yFaixa + 7.5, {
          width: LARGEM_UTIL - 120,
        });
      if (ref.horario) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(TEAL)
          .text(ref.horario, MARGEM_ESQ + LARGEM_UTIL - 90, yFaixa + 8, {
            width: 76, align: 'right',
          });
      }
      doc.y = yFaixa + alturaFaixa + 8;

      // ── Itens ──
      let zebra = false;
      for (const it of ref.itens) {
        doc.font('Helvetica').fontSize(10);
        const nomeAltura = Math.max(
          1,
          Math.ceil(doc.widthOfString(it.nome) / (LARGEM_UTIL - 170)),
        );
        const alturaItem = 10 + nomeAltura * 13 + it.substitutos.length * 11;
        if (doc.y + alturaItem > ALTURA_A4 - MARGEM_INF - 20) {
          doc.addPage();
          this.desenharTopo(doc, false);
          doc.y = MARGEM_SUP - 30;
        }
        const yItem = doc.y;
        doc.rect(MARGEM_ESQ, yItem, LARGEM_UTIL, alturaItem)
          .fill(zebra ? AZUL_CLARO : '#ffffff');

        doc.font('Helvetica').fontSize(10).fillColor(TEXTO)
          .text(it.nome, MARGEM_ESQ + 14, yItem + 7, { width: LARGEM_UTIL - 170 });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(AZUL)
          .text(it.medida, MARGEM_ESQ + LARGEM_UTIL - 150, yItem + 7, {
            width: 136, align: 'right',
          });

        let ySub = doc.y;
        for (const sub of it.substitutos) {
          ySub = doc.y;
          doc.font('Helvetica').fontSize(8.5).fillColor(TEXTO_SUAVE)
            .text(`ou  ${sub}`, MARGEM_ESQ + 26, ySub, { width: LARGEM_UTIL - 40 });
        }

        doc.y = Math.max(doc.y, yItem + alturaItem);
        doc.x = MARGEM_ESQ;
        zebra = !zebra;
      }

      doc.x = MARGEM_ESQ;
      doc.moveDown(0.9);
    }

    // ── Hidratação ────────────────────────────────────────────────────
    if (dados.metaAguaLitros && dados.metaAguaLitros > 0) {
      if (doc.y > ALTURA_A4 - MARGEM_INF - 120) {
        doc.addPage();
        this.desenharTopo(doc, false);
        doc.y = MARGEM_SUP - 30;
      }
      doc.moveDown(0.4);
      const yAgua = doc.y;
      doc.roundedRect(MARGEM_ESQ, yAgua, LARGEM_UTIL, 30, 6).fill(AZUL_CLARO);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(AZUL)
        .text(
          `Hidratação diária: ${dados.metaAguaLitros.toLocaleString('pt-BR')} litros de água`,
          MARGEM_ESQ + 14, yAgua + 9, { width: LARGEM_UTIL - 28 },
        );
      doc.y = yAgua + 30;
      doc.x = MARGEM_ESQ;
    }

    // ── Nota de individualidade ───────────────────────────────────────
    doc.moveDown(0.8);
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(TEXTO_SUAVE)
      .text(
        'Este plano alimentar é individualizado, elaborado a partir da sua avaliação nutricional. ' +
        'Não deve ser compartilhado ou seguido por terceiros. Em caso de dúvida, fale com seu nutricionista.',
        { align: 'justify', lineGap: 2 },
      );

    // ── Assinatura ────────────────────────────────────────────────────
    let yAssinatura = Math.max(doc.y + 46, ALTURA_A4 - MARGEM_INF - 84);
    if (yAssinatura + 64 > ALTURA_A4 - MARGEM_INF) {
      doc.addPage();
      this.desenharTopo(doc, false);
      yAssinatura = MARGEM_SUP + 20;
      doc.y = yAssinatura;
    }
    doc.x = MARGEM_ESQ;
    doc.y = yAssinatura;
    doc.font('Helvetica').fontSize(9).fillColor(TEXTO_SUAVE)
      .text(`São Paulo, ${dataExtenso(new Date())}.`, { align: 'center', width: LARGEM_UTIL });
    doc.moveDown(2.4);
    const yRisco = doc.y;
    doc.moveTo(LARGEMA4 / 2 - 110, yRisco).lineTo(LARGEMA4 / 2 + 110, yRisco)
      .lineWidth(0.8).strokeColor(TEXTO_SUAVE).stroke();
    doc.y = yRisco + 8;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXTO)
      .text(prof.nome, { align: 'center', width: LARGEM_UTIL });
    doc.font('Helvetica').fontSize(8.5).fillColor(TEXTO_SUAVE)
      .text(prof.especialidade, { align: 'center', width: LARGEM_UTIL });
    doc.text(`CRN ${prof.conselhoNumero}`, { align: 'center', width: LARGEM_UTIL });

    // ── Paginação em todas as páginas ─────────────────────────────────
    doc.flushPages();
    const total = doc.bufferedPageRange().count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor(TEXTO_SUAVE)
        .text(
          `Página ${i + 1} de ${total}`,
          MARGEM_ESQ, ALTURA_A4 - 34, { width: LARGEM_UTIL, align: 'center' },
        );
    }

    doc.end();
    return doc;
  }
}
