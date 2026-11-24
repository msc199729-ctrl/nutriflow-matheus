/**
 * PDF timbrado do plano alimentar — entrega ao paciente.
 *
 * Rota (registrada no DocumentosController):
 *   GET /documentos/plano-alimentar/:idPlano/pdf   -> PDF inline
 *
 * Design: mesmo timbre do atestado/recibo (nome + especialidade + CRN no
 * topo, linha divisória), corpo em tabelas por refeição (zebra sutil) e
 * bloco de assinatura com CRN. Segue Res. CFN 599/2018 + 856/2026: sem
 * promessa de resultado; é a PRESCRIÇÃO, não material de divulgação.
 *
 * Logo: placeholder — quando o arquivo existir em assets/logo.png,
 * descomentar o bloco LOGO em gerar().
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { PROFISSIONAL_PADRAO } from './documentos.config';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PacientesService } from '../pacientes/pacientes.service';

const MARGEM_ESQ = 56;
const MARGEM_DIR = 56;
const MARGEM_SUP = 64;
const MARGEM_INF = 64;
const LARGEMA4 = 595.28; // pt
const LARGEM_UTIL = LARGEMA4 - MARGEM_ESQ - MARGEM_DIR;
const COR_PRIMARIA = '#1e3a5f';
const COR_LINHA = '#d0d0d0';
const COR_ZEBRA = '#f4f6f8';

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

  gerar(dados: DadosPlano): PDFKit.PDFDocument {
    const prof = PROFISSIONAL_PADRAO;
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEM_SUP, bottom: MARGEM_INF, left: MARGEM_ESQ, right: MARGEM_DIR },
      info: { Title: `Plano alimentar — ${dados.paciente}` },
    });

    // ── Timbre ────────────────────────────────────────────────────────
    // LOGO: quando houver o arquivo, descomentar:
    // doc.image('assets/logo.png', MARGEM_ESQ, MARGEM_SUP - 28, { height: 44 });

    doc.font('Helvetica-Bold').fontSize(13).fillColor(COR_PRIMARIA)
      .text('NUTRICIONISTA MATHEUS S CARVALHO', MARGEM_ESQ, MARGEM_SUP, {
        align: 'center', width: LARGEM_UTIL,
      });
    doc.font('Helvetica').fontSize(9).fillColor('#555555')
      .text('Nutrição Clínica Esportiva', { align: 'center', width: LARGEM_UTIL });
    doc.fontSize(8.5)
      .text(`CRN ${prof.conselhoNumero}`, { align: 'center', width: LARGEM_UTIL });

    doc.moveDown(0.6);
    const yLinha = doc.y;
    doc.moveTo(MARGEM_ESQ, yLinha).lineTo(LARGEMA4 - MARGEM_DIR, yLinha)
      .lineWidth(1).strokeColor(COR_PRIMARIA).stroke();
    doc.moveDown(1.2);

    // ── Cabeçalho do documento ────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111111')
      .text('PLANO ALIMENTAR', { align: 'center', width: LARGEM_UTIL });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(10).fillColor('#444444')
      .text(`Paciente: ${dados.paciente}`, { align: 'center', width: LARGEM_UTIL });
    doc.fontSize(9).fillColor('#666666');
    const vigencia = dados.dataInicio
      ? `Vigência: ${dataCurta(dados.dataInicio)}${dados.dataFim ? ` a ${dataCurta(dados.dataFim)}` : ''}`
      : '';
    const sub = [dados.nomePlano, vigencia].filter(Boolean).join(' · ');
    if (sub) doc.text(sub, { align: 'center', width: LARGEM_UTIL });
    doc.moveDown(1.4);

    // ── Corpo ─────────────────────────────────────────────────────────
    if (dados.tipoPlano === 'Qualitativo' && dados.descricaoQualitativa?.trim()) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111')
        .text('Orientações gerais');
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(10).fillColor('#333333')
        .text(dados.descricaoQualitativa.trim(), { align: 'justify', lineGap: 3 });
      doc.moveDown(1.2);
    }

    for (const ref of dados.refeicoes) {
      // Quebra de página antes da refeição se não couber o título + 1 item
      if (doc.y > doc.page.height - MARGEM_INF - 120) {
        doc.addPage();
        doc.y = MARGEM_SUP;
      }

      const tituloRef = ref.horario ? `${ref.nome} — ${ref.horario}` : ref.nome;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COR_PRIMARIA)
        .text(tituloRef.toUpperCase());
      doc.moveDown(0.3);

      const y0 = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#555555');
      doc.text('ALIMENTO', MARGEM_ESQ + 8, y0, { width: LARGEM_UTIL - 150 });
      doc.text('QUANTIDADE', MARGEM_ESQ + LARGEM_UTIL - 140, y0, { width: 132, align: 'right' });
      doc.moveDown(0.2);
      doc.moveTo(MARGEM_ESQ, doc.y).lineTo(LARGEMA4 - MARGEM_DIR, doc.y)
        .lineWidth(0.7).strokeColor(COR_LINHA).stroke();
      doc.moveDown(0.25);

      doc.font('Helvetica').fontSize(10);
      let zebra = false;
      for (const it of ref.itens) {
        const alturaEstimada = 16 + it.substitutos.length * 12;
        if (doc.y + alturaEstimada > doc.page.height - MARGEM_INF - 24) {
          doc.addPage();
          doc.y = MARGEM_SUP;
        }
        const yItem = doc.y;
        const fundo = zebra ? COR_ZEBRA : '#ffffff';
        doc.rect(MARGEM_ESQ, yItem - 3, LARGEM_UTIL, alturaEstimada).fill(fundo);
        doc.fillColor('#111111');

        doc.font('Helvetica').fontSize(10)
          .text(it.nome, MARGEM_ESQ + 8, yItem, { width: LARGEM_UTIL - 160 });
        doc.font('Helvetica-Bold').fontSize(10)
          .text(it.medida, MARGEM_ESQ + LARGEM_UTIL - 140, yItem, { width: 132, align: 'right' });

        let yAtual = doc.y;
        for (const sub of it.substitutos) {
          yAtual = doc.y;
          doc.font('Helvetica').fontSize(8.5).fillColor('#777777')
            .text(`ou ${sub}`, MARGEM_ESQ + 16, yAtual, { width: LARGEM_UTIL - 24 });
        }

        // avançar para depois do maior bloco (nome pode ocupar 2 linhas)
        doc.y = Math.max(doc.y, yItem + alturaEstimada - 8);
        doc.x = MARGEM_ESQ;
        zebra = !zebra;
      }

      doc.x = MARGEM_ESQ;
      doc.moveDown(1);
    }

    // ── Água + orientações fixas ──────────────────────────────────────
    if (doc.y > doc.page.height - MARGEM_INF - 150) {
      doc.addPage();
      doc.y = MARGEM_SUP;
    }
    doc.moveDown(0.5);
    if (dados.metaAguaLitros && dados.metaAguaLitros > 0) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111')
        .text(`Hidratação: ${dados.metaAguaLitros.toLocaleString('pt-BR')} litros de água por dia`);
      doc.moveDown(0.6);
    }
    doc.font('Helvetica').fontSize(8.5).fillColor('#666666')
      .text(
        'Este plano alimentar é individualizado e foi elaborado a partir da sua avaliação nutricional. ' +
        'Não deve ser compartilhado ou seguido por terceiros. Em caso de dúvida, fale com seu nutricionista.',
        { align: 'justify', lineGap: 2 },
      );

    // ── Rodapé com assinatura ─────────────────────────────────────────
    const yAssinatura = Math.max(doc.y + 40, doc.page.height - MARGEM_INF - 90);
    if (yAssinatura + 70 > doc.page.height - MARGEM_INF) {
      doc.addPage();
      doc.y = MARGEM_SUP + 40;
    }
    doc.x = MARGEM_ESQ;
    doc.y = yAssinatura;
    doc.font('Helvetica').fontSize(9).fillColor('#444444')
      .text(`São Paulo, ${dataExtenso(new Date())}.`, { align: 'center', width: LARGEM_UTIL });
    doc.moveDown(2.2);
    const yRisco = doc.y;
    doc.moveTo(LARGEMA4 / 2 - 110, yRisco).lineTo(LARGEMA4 / 2 + 110, yRisco)
      .lineWidth(0.8).strokeColor('#444444').stroke();
    doc.y = yRisco + 8;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111')
      .text(prof.nome, { align: 'center', width: LARGEM_UTIL });
    doc.font('Helvetica').fontSize(8.5).fillColor('#555555')
      .text(prof.especialidade, { align: 'center', width: LARGEM_UTIL });
    doc.text(`CRN ${prof.conselhoNumero}`, { align: 'center', width: LARGEM_UTIL });

    doc.end();
    return doc;
  }
}
