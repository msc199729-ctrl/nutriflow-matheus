import { ForbiddenException, Injectable } from '@nestjs/common';
import { PerfilUsuario, TipoConselho } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../common/tenant/tenant-scope';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GerarImpressoDto, TipoImpresso } from './dto/gerar-impresso.dto';

export type RelatorioGeradoItem = {
  id: number;
  name: string;
  date: string;
  type: string;
  pages: number;
};

@Injectable()
export class RelatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureProfissional(user: JwtPayloadUser): void {
    if (
      user.perfil !== PerfilUsuario.nutricionista &&
      user.perfil !== PerfilUsuario.admin_clinica
    ) {
      throw new ForbiddenException('Acesso negado');
    }
  }

  private wherePaciente(user: JwtPayloadUser) {
    const wid = requireWorkspaceId(user);
    if (user.perfil === PerfilUsuario.nutricionista) {
      return { workspaceId: wid, idNutricionista: user.sub };
    }
    return { workspaceId: wid };
  }

  private formatDataPtBr(d: Date): string {
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private getLogoPath(): string | null {
    const candidates = [
      resolve(process.cwd(), 'public', 'assets', 'onutri.png'),
      resolve(process.cwd(), '..', 'frontend', 'public', 'assets', 'onutri.png'),
      resolve(process.cwd(), '..', 'src', 'mail', 'assets', 'onutri.png'),
    ];
    const found = candidates.find((p) => existsSync(p));
    return found ?? null;
  }

  private parseParagraphs(text?: string): string[] {
    if (!text?.trim()) return [];
    return text
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  private drawHeader(
    doc: PDFKit.PDFDocument,
    title: string,
    subtitle: string,
    logoPath: string | null,
  ) {
    const pageWidth = doc.page.width;
    const centerX = pageWidth / 2;

    if (logoPath) {
      doc.image(logoPath, centerX - 34, 24, { fit: [68, 68] });
    } else {
      doc
        .fillColor('#0f766e')
        .fontSize(18)
        .text('ON', centerX - 10, 40);
    }

    doc
      .fillColor('#111827')
      .fontSize(16)
      .text(title, 50, 102, { align: 'left' })
      .fontSize(10)
      .fillColor('#6b7280')
      .text(subtitle, 50, 122, { align: 'left' });

    doc
      .moveTo(50, 142)
      .lineTo(545, 142)
      .lineWidth(1)
      .strokeColor('#d1d5db')
      .stroke();

    doc.y = 158;
    doc.x = 50;
    doc.fillColor('#111827');
  }

  async getResumo(user: JwtPayloadUser, mesAno: string) {
    this.ensureProfissional(user);
    const [anoStr, mesStr] = mesAno.split('-');
    const ano = parseInt(anoStr, 10);
    const mes = parseInt(mesStr, 10);
    if (Number.isNaN(ano) || Number.isNaN(mes) || mes < 1 || mes > 12) {
      return this.getResumoVazio();
    }
    const inicioMes = new Date(ano, mes - 1, 1);
    const fimMes = new Date(ano, mes, 0, 23, 59, 59, 999);

    const wherePaciente = this.wherePaciente(user);

    const idsPacientes = await this.prisma.paciente
      .findMany({
        where: wherePaciente,
        select: { id: true },
      })
      .then((r) => r.map((p) => p.id));

    if (idsPacientes.length === 0) {
      return this.getResumoVazio();
    }

    const [
      totalPacientes,
      novosPacientesCount,
      dietasGeradas,
      objetivosRaw,
      consultasRealizadas,
      pacientesComRespostaNoMes,
    ] = await Promise.all([
      this.prisma.paciente.count({ where: wherePaciente }),
      this.prisma.usuario.count({
        where: {
          id: { in: idsPacientes },
          criadoEm: { gte: inicioMes, lte: fimMes },
        },
      }),
      this.prisma.planoAlimentar.count({
        where: {
          paciente: wherePaciente,
          dataInicio: { gte: inicioMes, lte: fimMes },
        },
      }),
      this.prisma.paciente.findMany({
        where: wherePaciente,
        select: { objetivo: true },
      }),
      this.prisma.consultaAgendada.count({
        where: {
          inicio: { gte: inicioMes, lte: fimMes },
          paciente: wherePaciente,
        },
      }),
      this.prisma.envioFormulario.groupBy({
        by: ['idPaciente'],
        where: {
          paciente: wherePaciente,
          respondidoEm: { gte: inicioMes, lte: fimMes, not: null },
        },
      }),
    ]);

    const novosPacientes = Number(novosPacientesCount);

    const objetivosMap = new Map<string, number>();
    for (const p of objetivosRaw) {
      const o = p.objetivo?.trim() || 'Não informado';
      objetivosMap.set(o, (objetivosMap.get(o) ?? 0) + 1);
    }
    const objetivos = Array.from(objetivosMap.entries()).map(([goal, count]) => ({
      objetivo: goal,
      count,
      pct: totalPacientes > 0 ? Math.round((count / totalPacientes) * 100) : 0,
    }));

    const topPacientes = await this.getTopPacientesNoMes(
      user,
      5,
      inicioMes,
      fimMes,
    );
    const evolucaoAdesao = await this.getEvolucaoAdesao(user, 6, ano, mes);

    /** % de pacientes com pelo menos um check-in respondido no mês */
    const taxaRetencao =
      totalPacientes > 0
        ? Math.min(
            100,
            Math.round((pacientesComRespostaNoMes.length / totalPacientes) * 100),
          )
        : 0;

    const relatoriosGerados = await this.getRelatoriosGeradosRecentes(
      user,
      idsPacientes,
      8,
    );

    return {
      consultasRealizadas,
      novosPacientes,
      taxaRetencao,
      dietasGeradas,
      totalPacientes,
      evolucaoAdesao,
      objetivos,
      topPacientes,
      relatoriosGerados,
    };
  }

  async buildResumoPdf(user: JwtPayloadUser, mesAno: string): Promise<Buffer> {
    this.ensureProfissional(user);
    const data = await this.getResumo(user, mesAno);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Relatório — ONutri', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor('#444').text(`Período: ${mesAno}`, { align: 'center' });
      doc.moveDown(1.5);
      doc.fillColor('#000');
      doc.fontSize(11);
      doc.text(`Consultas realizadas: ${data.consultasRealizadas}`);
      doc.text(`Novos pacientes: ${data.novosPacientes}`);
      doc.text(
        `Engajamento (respondeu ≥1 check-in no mês): ${data.taxaRetencao}% do total de pacientes`,
      );
      doc.text(`Dietas geradas (início no mês): ${data.dietasGeradas}`);
      doc.text(`Total de pacientes: ${data.totalPacientes}`);
      doc.moveDown();
      doc.fontSize(12).text('Evolução adesão check-in (últimos 6 meses até o período)', {
        underline: true,
      });
      doc.moveDown(0.3);
      doc.fontSize(10);
      for (const e of data.evolucaoAdesao) {
        doc.text(`${e.mes}: ${e.valor}%`);
      }
      doc.moveDown();
      doc.fontSize(12).text('Objetivos (distribuição atual)', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10);
      for (const o of data.objetivos) {
        doc.text(`${o.objetivo}: ${o.count} (${o.pct}%)`);
      }
      doc.end();
    });
  }

  async buildImpressoPdf(
    user: JwtPayloadUser,
    dto: GerarImpressoDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.ensureProfissional(user);
    const wherePaciente = this.wherePaciente(user);
    const paciente = await this.prisma.paciente.findFirst({
      where: { id: dto.idPaciente, ...wherePaciente },
      include: {
        usuario: { select: { email: true } },
      },
    });
    if (!paciente) {
      throw new ForbiddenException('Paciente não encontrado no seu escopo.');
    }

    const nutricionista = await this.prisma.nutricionista.findUnique({
      where: { id: user.sub },
      select: { nome: true, crn: true, tipoConselho: true },
    });
    const nomeNutri = nutricionista?.nome?.trim() || 'Nutricionista Responsável';
    const siglaConselho =
      nutricionista?.tipoConselho === TipoConselho.crm ? 'CRM' : 'CRN';
    const numConselho = nutricionista?.crn?.trim();
    const crnNutri = numConselho
      ? `${siglaConselho} ${numConselho}`
      : `${siglaConselho} não informado`;
    const logoPath = this.getLogoPath();
    const dataEmissao = this.formatDataPtBr(new Date());
    const nomePaciente = paciente.nome?.trim() || `Paciente #${paciente.id}`;
    const cpfPaciente = paciente.cpf?.trim() || '—';

    const planoAtivo =
      dto.tipo === TipoImpresso.PRESCRICAO_ALIMENTAR &&
      dto.incluirPlanoAtivo !== false
        ? await this.prisma.planoAlimentar.findFirst({
            where: { idPaciente: paciente.id, ativo: true },
            include: {
              refeicoesPlanejadas: {
                include: {
                  itensDieta: {
                    include: { alimento: { select: { nome: true } } },
                  },
                },
                orderBy: { horarioSugerido: 'asc' },
              },
            },
            orderBy: { id: 'desc' },
          })
        : null;

    const titleByType: Record<TipoImpresso, string> = {
      [TipoImpresso.PRESCRICAO_ALIMENTAR]: 'Prescrição Alimentar',
      [TipoImpresso.LAUDO_NUTRICIONAL]: 'Laudo Nutricional',
      [TipoImpresso.ORIENTACOES_NUTRICIONAIS]: 'Orientações Nutricionais',
      [TipoImpresso.ATESTADO_NUTRICIONAL]: 'Atestado Nutricional',
      [TipoImpresso.RECEITUARIO_PERSONALIZADO]: 'Receituário Personalizado',
    };
    const title = dto.titulo?.trim() || titleByType[dto.tipo];

    const buffer = await new Promise<Buffer>((resolveBuffer, rejectBuffer) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolveBuffer(Buffer.concat(chunks)));
      doc.on('error', rejectBuffer);

      this.drawHeader(
        doc,
        title,
        `Paciente: ${nomePaciente} - CPF: ${cpfPaciente} • Emitido em: ${dataEmissao}`,
        logoPath,
      );

      doc.fontSize(11).fillColor('#111827');
      doc.text(`Profissional responsável: ${nomeNutri} — ${crnNutri}`);
      doc.moveDown(1);

      if (dto.tipo === TipoImpresso.PRESCRICAO_ALIMENTAR) {
        doc.fontSize(13).text('Plano alimentar', { underline: true });
        doc.moveDown(0.5);
        if (!planoAtivo) {
          doc
            .fontSize(11)
            .fillColor('#374151')
            .text('Nenhum plano ativo encontrado para o paciente.');
        } else {
          doc
            .fontSize(11)
            .fillColor('#111827')
            .text(`Plano: ${planoAtivo.nome ?? 'Plano alimentar ativo'}`);
          if (planoAtivo.metaAguaLitros != null) {
            doc.text(`Meta de água: ${planoAtivo.metaAguaLitros} L/dia`);
          }
          doc.moveDown(0.5);
          for (const refeicao of planoAtivo.refeicoesPlanejadas) {
            const horario = refeicao.horarioSugerido
              ? refeicao.horarioSugerido.toISOString().slice(11, 16)
              : '—:—';
            doc
              .fontSize(11)
              .fillColor('#0f766e')
              .text(`${refeicao.nome ?? 'Refeição'} • ${horario}`);
            doc.fontSize(10).fillColor('#111827');
            if (refeicao.itensDieta.length === 0) {
              doc.text('• Sem itens cadastrados', { indent: 10 });
            } else {
              for (const item of refeicao.itensDieta) {
                const alimento = item.alimento?.nome ?? `Alimento #${item.idAlimento}`;
                const qtd = item.aVontade
                  ? 'à vontade'
                  : `${item.quantidadeGramas ?? 0} g`;
                const medida = item.medidaCaseira?.trim()
                  ? ` (${item.medidaCaseira})`
                  : '';
                doc.text(`• ${alimento}: ${qtd}${medida}`, { indent: 10 });
              }
            }
            doc.moveDown(0.35);
          }
        }
      } else {
        const paragraphs = this.parseParagraphs(dto.conteudo);
        if (paragraphs.length === 0) {
          doc
            .fontSize(11)
            .fillColor('#374151')
            .text('Conteúdo não informado. Edite o texto na tela de impressos.');
        } else {
          doc.fontSize(11).fillColor('#111827');
          for (const p of paragraphs) {
            doc.text(p, { align: 'justify' });
            doc.moveDown(0.4);
          }
        }
      }

      if (dto.observacoes?.trim()) {
        doc.moveDown(0.8);
        doc.fontSize(12).fillColor('#111827').text('Observações', {
          underline: true,
        });
        doc.moveDown(0.3);
        for (const p of this.parseParagraphs(dto.observacoes)) {
          doc.fontSize(10.5).fillColor('#374151').text(`• ${p}`);
        }
      }

      if (
        dto.tipo === TipoImpresso.LAUDO_NUTRICIONAL ||
        dto.tipo === TipoImpresso.ATESTADO_NUTRICIONAL
      ) {
        const y = Math.max(doc.y + 24, 680);
        doc.moveTo(320, y).lineTo(520, y).strokeColor('#9ca3af').stroke();
        doc
          .fontSize(10)
          .fillColor('#4b5563')
          .text(`${nomeNutri} • ${crnNutri}`, 320, y + 6, {
            width: 200,
            align: 'center',
          });
      }

      doc.end();
    });

    const filename = `${dto.tipo}-${paciente.id}-${new Date()
      .toISOString()
      .slice(0, 10)}`;
    return { buffer, filename };
  }

  private getResumoVazio() {
    return {
      consultasRealizadas: 0,
      novosPacientes: 0,
      taxaRetencao: 0,
      dietasGeradas: 0,
      totalPacientes: 0,
      evolucaoAdesao: [] as Array<{ mes: string; valor: number }>,
      objetivos: [] as Array<{ objetivo: string; count: number; pct: number }>,
      topPacientes: [] as Array<{
        id: number;
        nome: string;
        iniciais: string;
        adherence: number;
        weightChange: string;
      }>,
      relatoriosGerados: [] as RelatorioGeradoItem[],
    };
  }

  private async getRelatoriosGeradosRecentes(
    user: JwtPayloadUser,
    idsPacientes: number[],
    take: number,
  ): Promise<RelatorioGeradoItem[]> {
    const wherePaciente = this.wherePaciente(user);
    const analises = await this.prisma.analiseIa.findMany({
      where: {
        idPaciente: { in: idsPacientes },
        paciente: wherePaciente,
      },
      orderBy: { criadoEm: 'desc' },
      take,
      select: {
        id: true,
        tipoAnalise: true,
        criadoEm: true,
        snapshotPrompt: true,
      },
    });

    return analises.map((a) => {
      const raw =
        a.tipoAnalise?.trim() ||
        a.snapshotPrompt?.trim()?.slice(0, 48) ||
        'Análise IA';
      const name = raw.length > 56 ? `${raw.slice(0, 53)}…` : raw;
      return {
        id: a.id,
        name,
        date: a.criadoEm ? this.formatDataPtBr(a.criadoEm) : '—',
        type: 'IA Insights',
        pages: 1,
      };
    });
  }

  /** Últimos `numMeses` meses terminando em (anoFim, mesFim). */
  private async getEvolucaoAdesao(
    user: JwtPayloadUser,
    numMeses: number,
    anoFim: number,
    mesFim: number,
  ): Promise<Array<{ mes: string; valor: number }>> {
    const wherePac = this.wherePaciente(user);
    const where = { paciente: wherePac };
    const resultado: Array<{ mes: string; valor: number }> = [];
    const nomesMes = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];

    for (let j = 0; j < numMeses; j++) {
      const d = new Date(anoFim, mesFim - 1, 1);
      d.setMonth(d.getMonth() - (numMeses - 1 - j));
      const inicio = new Date(d.getFullYear(), d.getMonth(), 1);
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

      const [total, respondidos] = await Promise.all([
        this.prisma.envioFormulario.count({
          where: { ...where, enviadoEm: { gte: inicio, lte: fim } },
        }),
        this.prisma.envioFormulario.count({
          where: {
            ...where,
            enviadoEm: { gte: inicio, lte: fim },
            respondidoEm: { not: null },
          },
        }),
      ]);
      const valor = total > 0 ? Math.round((respondidos / total) * 100) : 0;
      const labelMes = `${nomesMes[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
      resultado.push({ mes: labelMes, valor });
    }
    return resultado;
  }

  /** Adesão apenas com envios cujo `enviadoEm` cai no mês selecionado. */
  private async getTopPacientesNoMes(
    user: JwtPayloadUser,
    limit: number,
    inicioMes: Date,
    fimMes: Date,
  ) {
    const wherePaciente = this.wherePaciente(user);
    const pacientes = await this.prisma.paciente.findMany({
      where: wherePaciente,
      include: {
        enviosFormulario: {
          where: {
            enviadoEm: { gte: inicioMes, lte: fimMes },
          },
          select: { id: true, respondidoEm: true },
        },
      },
    });

    const comAdesao = pacientes
      .map((p) => {
        const envios = p.enviosFormulario;
        const total = envios.length;
        const respondidos = envios.filter((e) => e.respondidoEm != null).length;
        const adherence = total > 0 ? Math.round((respondidos / total) * 100) : 0;
        const partes = (p.nome ?? '?')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const initials =
          partes.length >= 2
            ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
            : (p.nome ?? '?').slice(0, 2).toUpperCase();
        return {
          id: p.id,
          nome: p.nome ?? `Paciente #${p.id}`,
          iniciais: initials,
          adherence,
          weightChange: '—',
          _totalMes: total,
        };
      })
      .filter((x) => x._totalMes > 0)
      .map(({ _totalMes, ...rest }) => rest);
    comAdesao.sort((a, b) => b.adherence - a.adherence);
    return comAdesao.slice(0, limit);
  }
}
