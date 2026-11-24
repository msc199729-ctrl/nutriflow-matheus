import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { MODELOS } from './documentos.templates';
import { PROFISSIONAL_PADRAO } from './documentos.config';
import { AtestadoDto, DocumentoLivreDto, ReciboDto } from './documentos.dto';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const UNIDADES = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return DEZENAS[d] + (u ? ` e ${UNIDADES[u]}` : '');
  }
  const c = Math.floor(n / 100);
  const r = n % 100;
  return CENTENAS[c] + (r ? ` e ${ate999(r)}` : '');
}

function inteiroExtenso(n: number): string {
  if (n === 0) return 'zero';
  const partes: string[] = [];
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  if (milhoes) partes.push(milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`);
  if (milhares) partes.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`);
  if (resto) partes.push(ate999(resto));
  if (partes.length === 1) return partes[0];
  if (partes.length === 2) return `${partes[0]} e ${partes[1]}`;
  return `${partes[0]} ${partes[1]} e ${partes[2]}`;
}

export function valorEmReais(valor: number): string {
  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);
  let txt = `${inteiroExtenso(inteiro)} ${inteiro === 1 ? 'real' : 'reais'}`;
  if (centavos > 0) {
    txt += ` e ${ate999(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`;
  }
  return txt;
}

function dataExtenso(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}

function duracaoTexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} hora${h > 1 ? 's' : ''} e ${m} minutos`;
  if (h) return `${h} hora${h > 1 ? 's' : ''}`;
  return `${m} minutos`;
}

interface Profissional {
  nome: string;
  especialidade: string;
  conselhoTipo: string;
  conselhoNumero: string;
}

interface Bloco {
  titulo: string;
  valorDestaque?: string;
  paragrafos: string[];
  assinaturaData: string;
}

const MARGEM_ESQ = 80;
const MARGEM_SUP = 72;

function renderizar(prof: Profissional, bloco: Bloco): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGEM_SUP, bottom: 72, left: MARGEM_ESQ, right: MARGEM_ESQ },
  });

  doc.font('Times-Bold').fontSize(14).text(prof.nome.toUpperCase(), { align: 'center' });
  doc.font('Times-Roman').fontSize(10).text(prof.especialidade, { align: 'center' });
  doc.font('Times-Roman').fontSize(10).text(`${prof.conselhoTipo} ${prof.conselhoNumero}`, { align: 'center' });

  doc.moveDown(0.7);
  const yLinha = doc.y;
  doc.moveTo(MARGEM_ESQ, yLinha).lineTo(doc.page.width - MARGEM_ESQ, yLinha).lineWidth(0.8).stroke('#444444');
  doc.moveDown(2.2);

  doc.font('Times-Bold').fontSize(13).text(bloco.titulo, { align: 'center' });
  doc.moveDown(1.5);

  if (bloco.valorDestaque) {
    doc.font('Times-Bold').fontSize(12).text(bloco.valorDestaque, { align: 'right' });
    doc.moveDown(1);
  }

  doc.font('Times-Roman').fontSize(11);
  for (const p of bloco.paragrafos) {
    doc.text(p, { align: 'justify', indent: 28, lineGap: 4 });
    doc.moveDown(0.8);
  }

  const alturaBloco = 130;
  let yAssinatura = doc.page.height - 72 - alturaBloco;
  if (doc.y + 20 > yAssinatura) {
    doc.addPage();
    yAssinatura = doc.page.height - 72 - alturaBloco;
  }

  doc.x = MARGEM_ESQ;
  doc.y = yAssinatura;
  doc.font('Times-Roman').fontSize(11).text(bloco.assinaturaData, { align: 'center' });

  const yRisco = doc.y + 46;
  doc.moveTo(doc.page.width / 2 - 110, yRisco).lineTo(doc.page.width / 2 + 110, yRisco).lineWidth(0.8).stroke('#444444');

  doc.y = yRisco + 10;
  doc.font('Times-Bold').fontSize(10).text(prof.nome, { align: 'center' });
  doc.font('Times-Roman').fontSize(9);
  doc.text(prof.especialidade, { align: 'center' });
  doc.text(`${prof.conselhoTipo} ${prof.conselhoNumero}`, { align: 'center' });

  doc.end();
  return doc;
}

@Injectable()
export class DocumentosService {
  constructor(private readonly prisma: PrismaService) {}

  listarModelos() {
    return MODELOS;
  }

  private async pacienteAutorizado(idPaciente: number, user: any) {
    const paciente = await this.prisma.paciente.findUnique({
      where: { id: idPaciente },
      select: { id: true, nome: true, workspaceId: true },
    });
    if (!paciente) throw new NotFoundException('Paciente não encontrado');
    if (user?.workspaceId && paciente.workspaceId !== user.workspaceId) {
      throw new NotFoundException('Paciente não encontrado');
    }
    return paciente;
  }

  private profissional(dto: any): Profissional {
    return {
      nome: dto.nutricionistaNome?.trim() || PROFISSIONAL_PADRAO.nome,
      especialidade: dto.nutricionistaEspecialidade?.trim() || PROFISSIONAL_PADRAO.especialidade,
      conselhoTipo: dto.conselhoTipo?.trim() || PROFISSIONAL_PADRAO.conselhoTipo,
      conselhoNumero: dto.conselhoNumero?.trim() || PROFISSIONAL_PADRAO.conselhoNumero,
    };
  }

  async gerarAtestado(dto: AtestadoDto, user: any): Promise<PDFKit.PDFDocument> {
    const paciente = await this.pacienteAutorizado(dto.idPaciente, user);
    const nome = paciente.nome?.trim() || 'Paciente';
    const registro = String(paciente.id).padStart(4, '0');

    const [h1, m1] = dto.horaInicio.split(':').map(Number);
    const [h2, m2] = dto.horaFim.split(':').map(Number);
    const duracao = h2 * 60 + m2 - (h1 * 60 + m1);

    const paragrafos = [
      `Atesto, para os devidos fins, que o(a) paciente ${nome}, portador(a) do cadastro de acompanhamento nº ${registro}, compareceu a atendimento nutricional nesta data, ${dataExtenso(dto.data)}, no período de ${dto.horaInicio} às ${dto.horaFim}, para realização de ${dto.finalidade.trim().replace(/\.$/, '')}.`,
    ];

    if (duracao > 0) {
      paragrafos.push(`O atendimento teve duração total de ${duracaoTexto(duracao)}.`);
    }
    if (dto.observacoes?.trim()) {
      paragrafos.push(dto.observacoes.trim());
    }
    paragrafos.push('Este atestado é emitido a pedido do(a) interessado(a) para os fins que julgar necessários.');

    return renderizar(this.profissional(dto), {
      titulo: 'ATESTADO DE COMPARECIMENTO',
      paragrafos,
      assinaturaData: `${dto.cidade}, ${dataExtenso(dto.data)}.`,
    });
  }

  async gerarRecibo(dto: ReciboDto, user: any): Promise<PDFKit.PDFDocument> {
    const paciente = await this.pacienteAutorizado(dto.idPaciente, user);
    const nome = paciente.nome?.trim() || 'Paciente';
    const extenso = valorEmReais(dto.valor);
    const valorFmt = dto.valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const descricao =
      dto.descricao?.trim() ||
      `prestação de serviços de acompanhamento nutricional individualizado com duração de ${dto.meses} ${
        dto.meses === 1 ? 'mês' : 'meses'
      }, compreendendo: consulta inicial com anamnese completa, avaliação física e antropométrica, análise de composição corporal, prescrição de plano alimentar personalizado, orientações nutricionais para Crossfit e corrida, protocolo de suplementação, plano de hidratação e retornos periódicos de reavaliação durante o período contratado`;

    return renderizar(this.profissional(dto), {
      titulo: 'RECIBO DE PRESTAÇÃO DE SERVIÇOS',
      valorDestaque: `R$ ${valorFmt} (${extenso})`,
      paragrafos: [
        `Recebi de ${nome} a importância de R$ ${valorFmt} (${extenso}), referente a ${descricao.trim().replace(/\.$/, '')}.`,
        'Para clareza e validade do presente recibo, firmo o mesmo após conferência dos dados acima.',
        `Forma de pagamento: ${dto.formaPagamento}\nData de emissão: ${dataExtenso(dto.vigenciaInicio)}\nPeríodo de vigência: ${dto.vigenciaInicio.split('-').reverse().join('/')} a ${dto.vigenciaFim.split('-').reverse().join('/')}`,
      ],
      assinaturaData: `${dto.cidade}, ${dataExtenso(dto.vigenciaInicio)}.`,
    });
  }

  async gerarLivre(dto: DocumentoLivreDto, user: any): Promise<PDFKit.PDFDocument> {
    await this.pacienteAutorizado(dto.idPaciente, user);

    const paragrafos = dto.corpo
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    return renderizar(this.profissional(dto), {
      titulo: dto.titulo.toUpperCase(),
      paragrafos,
      assinaturaData: `${dto.cidade}, ${dataExtenso(dto.data)}.`,
    });
  }
}