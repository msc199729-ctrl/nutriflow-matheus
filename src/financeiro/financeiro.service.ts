import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PerfilUsuario, Prisma, StatusLancamentoFinanceiro } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../common/tenant/tenant-scope';
import { CreateLancamentoFinanceiroDto } from './dto/create-lancamento-financeiro.dto';
import { UpdateLancamentoFinanceiroDto } from './dto/update-lancamento-financeiro.dto';
import { QueryLancamentosFinanceirosDto } from './dto/query-lancamentos-financeiros.dto';

const APP_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Situação EFETIVA de um lançamento.
 *
 * `atrasado` nunca foi escrito no banco — não existe nada que promova um
 * pendente vencido. Em vez de depender de escrita (que falha em silêncio e
 * deixou o cartão "Atrasados" em R$ 0 desde sempre), derivamos na leitura:
 * atrasado é a consequência de uma data ter passado.
 */
function statusEfetivo(
  status: string,
  vencimento: Date,
  hoje: Date,
): StatusLancamentoFinanceiro {
  if (status === StatusLancamentoFinanceiro.pago) {
    return StatusLancamentoFinanceiro.pago;
  }
  if (status === StatusLancamentoFinanceiro.atrasado) {
    return StatusLancamentoFinanceiro.atrasado;
  }
  return vencimento < hoje
    ? StatusLancamentoFinanceiro.atrasado
    : StatusLancamentoFinanceiro.pendente;
}

@Injectable()
export class FinanceiroService {
  private readonly logger = new Logger(FinanceiroService.name);
  constructor(private readonly prisma: PrismaService) {}

  private ensureCanManage(user: JwtPayloadUser): void {
    if (
      user.perfil !== PerfilUsuario.nutricionista &&
      user.perfil !== PerfilUsuario.admin_clinica
    ) {
      throw new ForbiddenException(
        'Apenas nutricionista ou gestor da clínica pode acessar o financeiro.',
      );
    }
  }

  /**
   * Data de HOJE no fuso de Brasília, como Date de meia-noite UTC.
   *
   * Comparar vencimento com `new Date()` em UTC erra o dia: às 22h de Brasília
   * o UTC já é o dia seguinte, e um lançamento que vence hoje apareceria
   * atrasado (ou vice-versa).
   */
  private hojeUtc(): Date {
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return new Date(`${ymd}T00:00:00.000Z`);
  }

  private monthBounds(month: string): { start: Date; end: Date } {
    const [y, m] = month.split('-').map((v) => Number(v));
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    return { start, end };
  }

  private currentMonthKey(): string {
    // No fuso do app: em UTC, às 21h do último dia do mês já é o mês seguinte.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
    })
      .format(new Date())
      .slice(0, 7);
  }

  private normalizeDay(value: string): Date {
    const dt = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException('Data inválida');
    }
    return dt;
  }

  private mapLancamento(row: {
    id: number;
    idPaciente: number | null;
    descricao: string;
    pacienteNome: string | null;
    categoria: string | null;
    tipo: string;
    status: string;
    valor: number;
    vencimento: Date;
    pagoEm: Date | null;
    observacoes: string | null;
    criadoEm: Date;
    atualizadoEm: Date;
  }, hoje: Date = this.hojeUtc()) {
    return {
      id: row.id,
      idPaciente: row.idPaciente,
      descricao: row.descricao,
      pacienteNome: row.pacienteNome,
      categoria: row.categoria,
      tipo: row.tipo,
      // Status derivado: vencido e não pago É atrasado, mesmo que no banco
      // ainda esteja 'pendente'.
      status: statusEfetivo(row.status, row.vencimento, hoje),
      valor: row.valor,
      vencimento: row.vencimento.toISOString().slice(0, 10),
      pagoEm: row.pagoEm?.toISOString().slice(0, 10) ?? null,
      observacoes: row.observacoes,
      criadoEm: row.criadoEm.toISOString(),
      atualizadoEm: row.atualizadoEm.toISOString(),
    };
  }

  private whereByUserAndQuery(
    user: JwtPayloadUser,
    query: QueryLancamentosFinanceirosDto,
  ): Prisma.LancamentoFinanceiroWhereInput {
    this.ensureCanManage(user);
    const workspaceId = requireWorkspaceId(user);
    const mes = query.mes?.trim() || this.currentMonthKey();
    const { start, end } = this.monthBounds(mes);
    const busca = query.busca?.trim();

    return {
      workspaceId,
      ...(user.perfil === PerfilUsuario.nutricionista
        ? { idResponsavel: user.sub }
        : {}),
      vencimento: { gte: start, lt: end },
      ...(query.tipo ? { tipo: query.tipo } : {}),
      // Status NÃO entra aqui: 'atrasado' é derivado na leitura e um filtro
      // no banco por ele voltaria vazio. Também não dá para somar um segundo
      // `vencimento` neste objeto — o spread apagaria o do mês.
      ...(busca
        ? {
            OR: [
              { descricao: { contains: busca, mode: 'insensitive' } },
              { pacienteNome: { contains: busca, mode: 'insensitive' } },
              { categoria: { contains: busca, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  async list(user: JwtPayloadUser, query: QueryLancamentosFinanceirosDto) {
    const hoje = this.hojeUtc();
    const rows = await this.prisma.lancamentoFinanceiro.findMany({
      where: this.whereByUserAndQuery(user, query),
      orderBy: [{ vencimento: 'asc' }, { id: 'desc' }],
      // O celular vem junto: sem ele não há como cobrar ninguém pela tela.
      include: { paciente: { select: { celular: true } } },
    });
    const mapeados = rows.map((row) => ({
      ...this.mapLancamento(row, hoje),
      celular: row.paciente?.celular ?? null,
    }));

    // O filtro de status tem que ser aplicado DEPOIS de derivar: filtrar
    // 'atrasado' no banco não acharia nada, porque a coluna nunca recebe
    // esse valor.
    if (!query.status) return mapeados;
    return mapeados.filter((r) => r.status === query.status);
  }

  async create(user: JwtPayloadUser, dto: CreateLancamentoFinanceiroDto) {
    this.ensureCanManage(user);
    const workspaceId = requireWorkspaceId(user);
    const created = await this.prisma.lancamentoFinanceiro.create({
      data: {
        workspaceId,
        idResponsavel: user.sub,
        descricao: dto.descricao.trim(),
        pacienteNome: dto.pacienteNome?.trim() || null,
        categoria: dto.categoria?.trim() || null,
        competencia: dto.vencimento.slice(0, 7),
        tipo: dto.tipo,
        status: dto.status ?? 'pendente',
        valor: dto.valor,
        vencimento: this.normalizeDay(dto.vencimento),
        pagoEm: dto.pagoEm ? this.normalizeDay(dto.pagoEm) : null,
        observacoes: dto.observacoes?.trim() || null,
      },
    });
    return this.mapLancamento(created);
  }

  private async getOwnedLancamentoOrThrow(id: number, user: JwtPayloadUser) {
    this.ensureCanManage(user);
    const workspaceId = requireWorkspaceId(user);
    const row = await this.prisma.lancamentoFinanceiro.findFirst({
      where: {
        id,
        workspaceId,
        ...(user.perfil === PerfilUsuario.nutricionista
          ? { idResponsavel: user.sub }
          : {}),
      },
    });
    if (!row) throw new NotFoundException('Lançamento não encontrado');
    return row;
  }

  async update(id: number, user: JwtPayloadUser, dto: UpdateLancamentoFinanceiroDto) {
    await this.getOwnedLancamentoOrThrow(id, user);
    const data: Prisma.LancamentoFinanceiroUpdateInput = {};
    if (dto.descricao !== undefined) data.descricao = dto.descricao.trim();
    if (dto.pacienteNome !== undefined) data.pacienteNome = dto.pacienteNome.trim() || null;
    if (dto.categoria !== undefined) data.categoria = dto.categoria.trim() || null;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.valor !== undefined) data.valor = dto.valor;
    if (dto.vencimento !== undefined) {
      const venc = this.normalizeDay(dto.vencimento);
      data.vencimento = venc;
      // Competência acompanha o vencimento: antes ficava no mês antigo e
      // desalinhava a coluna.
      data.competencia = dto.vencimento.slice(0, 7);
    }
    if (dto.pagoEm !== undefined) data.pagoEm = dto.pagoEm ? this.normalizeDay(dto.pagoEm) : null;
    if (dto.observacoes !== undefined) data.observacoes = dto.observacoes.trim() || null;

    const updated = await this.prisma.lancamentoFinanceiro.update({
      where: { id },
      data,
    });
    return this.mapLancamento(updated);
  }

  async markAsPaid(id: number, user: JwtPayloadUser) {
    await this.getOwnedLancamentoOrThrow(id, user);
    const paid = await this.prisma.lancamentoFinanceiro.update({
      where: { id },
      data: {
        status: StatusLancamentoFinanceiro.pago,
        // Data de pagamento no fuso do app: às 22h de Brasília o UTC já é
        // amanhã e o pagamento ficaria com data futura.
        pagoEm: this.hojeUtc(),
      },
    });
    return this.mapLancamento(paid);
  }

  async remove(id: number, user: JwtPayloadUser) {
    await this.getOwnedLancamentoOrThrow(id, user);
    await this.prisma.lancamentoFinanceiro.delete({ where: { id } });
  }

  async resumo(user: JwtPayloadUser, month?: string) {
    this.ensureCanManage(user);
    const workspaceId = requireWorkspaceId(user);
    const mes = month?.trim() || this.currentMonthKey();
    const { start, end } = this.monthBounds(mes);

    const whereBase: Prisma.LancamentoFinanceiroWhereInput = {
      workspaceId,
      ...(user.perfil === PerfilUsuario.nutricionista ? { idResponsavel: user.sub } : {}),
    };

    const inMonthWhere: Prisma.LancamentoFinanceiroWhereInput = {
      ...whereBase,
      vencimento: { gte: start, lt: end },
    };

    const hoje = this.hojeUtc();
    const inMonth = await this.prisma.lancamentoFinanceiro.findMany({
      where: inMonthWhere,
      select: { tipo: true, status: true, valor: true, vencimento: true },
    });

    // Status derivado: é isto que faz o "Atrasados" sair do zero.
    const situacao = inMonth.map((x) => ({
      ...x,
      efetivo: statusEfetivo(x.status, x.vencimento, hoje),
    }));

    const receitaPrevista = situacao
      .filter((x) => x.tipo === 'receita')
      .reduce((sum, x) => sum + x.valor, 0);
    const receitaRecebida = situacao
      .filter((x) => x.tipo === 'receita' && x.efetivo === 'pago')
      .reduce((sum, x) => sum + x.valor, 0);
    const despesasPagas = situacao
      .filter((x) => x.tipo === 'despesa' && x.efetivo === 'pago')
      .reduce((sum, x) => sum + x.valor, 0);
    // Atrasado = receita vencida e não paga. Só receita: despesa atrasada é
    // dívida do consultório, não inadimplência de paciente.
    const atrasados = situacao
      .filter((x) => x.tipo === 'receita' && x.efetivo === 'atrasado')
      .reduce((sum, x) => sum + x.valor, 0);
    const despesasAtrasadas = situacao
      .filter((x) => x.tipo === 'despesa' && x.efetivo === 'atrasado')
      .reduce((sum, x) => sum + x.valor, 0);

    // Janela no fuso do app: somar 7 dias ao "hoje" do calendário, não ao
    // instante UTC (senão a lista erra por um dia depois das 21h).
    const daquiSeteDias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingRows = await this.prisma.lancamentoFinanceiro.findMany({
      where: {
        ...whereBase,
        status: { not: 'pago' },
        vencimento: { gte: hoje, lte: daquiSeteDias },
      },
      orderBy: [{ vencimento: 'asc' }, { id: 'desc' }],
      take: 8,
    });

    const fluxo = await Promise.all(
      Array.from({ length: 6 }).map(async (_, idx) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - idx));
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const bounds = this.monthBounds(key);
        const rows = await this.prisma.lancamentoFinanceiro.findMany({
          where: {
            ...whereBase,
            vencimento: { gte: bounds.start, lt: bounds.end },
          },
          select: { tipo: true, valor: true, status: true },
        });
        // Antes somava tudo numa barra só: receita prevista e recebida viravam
        // o mesmo número, e o gráfico mostrava um negócio melhor que o real.
        const receitasPrevistas = rows
          .filter((x) => x.tipo === 'receita')
          .reduce((sum, x) => sum + x.valor, 0);
        const receitasRecebidas = rows
          .filter((x) => x.tipo === 'receita' && x.status === 'pago')
          .reduce((sum, x) => sum + x.valor, 0);
        const despesasPrevistas = rows
          .filter((x) => x.tipo === 'despesa')
          .reduce((sum, x) => sum + x.valor, 0);
        const despesasPagasMes = rows
          .filter((x) => x.tipo === 'despesa' && x.status === 'pago')
          .reduce((sum, x) => sum + x.valor, 0);
        return {
          mes: key,
          label: d.toLocaleDateString('pt-BR', { month: 'short', timeZone: APP_TIME_ZONE }),
          receitasPrevistas,
          receitasRecebidas,
          despesasPrevistas,
          despesasPagas: despesasPagasMes,
          // Saldo honesto: o que entrou menos o que saiu.
          saldo: receitasRecebidas - despesasPagasMes,
          saldoPrevisto: receitasPrevistas - despesasPrevistas,
        };
      }),
    );

    return {
      mes,
      totais: {
        receitaPrevista,
        receitaRecebida,
        despesasPagas,
        despesasAtrasadas,
        saldoReal: receitaRecebida - despesasPagas,
        atrasados,
        // Quantos lançamentos compõem o valor acima: um total não diz se são
        // 2 pacientes ou 20.
        qtdAtrasados: situacao.filter(
          (x) => x.tipo === 'receita' && x.efetivo === 'atrasado',
        ).length,
      },
      proximosVencimentos: upcomingRows.map((x) => this.mapLancamento(x, hoje)),
      fluxoMensal: fluxo,
    };
  }

  private async gerarMensalidadesCore(params: {
    competencia?: string;
    workspaceId?: number;
    nutricionistaId?: number;
  }) {
    const competencia = params.competencia?.trim() || this.currentMonthKey();
    const { end } = this.monthBounds(competencia);

    const cobrancas = await this.prisma.cobrancaPaciente.findMany({
      where: {
        ativa: true,
        ...(params.workspaceId !== undefined
          ? { workspaceId: params.workspaceId }
          : {}),
        inicioCobranca: { lt: end },
        paciente:
          params.nutricionistaId !== undefined
            ? { idNutricionista: params.nutricionistaId }
            : undefined,
      },
      include: {
        paciente: {
          select: { id: true, nome: true, idNutricionista: true },
        },
      },
    });

    let geradas = 0;
    let ignoradas = 0;

    for (const cobranca of cobrancas) {
      const exists = await this.prisma.lancamentoFinanceiro.findFirst({
        where: {
          workspaceId: cobranca.workspaceId,
          idPaciente: cobranca.idPaciente,
          competencia,
          tipo: 'receita',
          origem: 'mensalidade',
        },
        select: { id: true },
      });
      if (exists) {
        ignoradas++;
        continue;
      }

      const y = Number(competencia.slice(0, 4));
      const m = Number(competencia.slice(5, 7));
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const day = Math.min(cobranca.diaVencimento, lastDay);
      const vencimento = new Date(Date.UTC(y, m - 1, day));

      await this.prisma.lancamentoFinanceiro.create({
        data: {
          workspaceId: cobranca.workspaceId,
          idResponsavel: cobranca.paciente.idNutricionista,
          idPaciente: cobranca.idPaciente,
          descricao: `Mensalidade - ${cobranca.paciente.nome ?? `Paciente #${cobranca.idPaciente}`} - ${competencia}`,
          pacienteNome: cobranca.paciente.nome,
          categoria: cobranca.categoria ?? 'Mensalidade',
          competencia,
          origem: 'mensalidade',
          tipo: 'receita',
          status: 'pendente',
          valor: cobranca.valorMensal,
          vencimento,
          observacoes: cobranca.observacoes,
        },
      });
      geradas++;
    }

    return {
      competencia,
      totalCobrancasAtivas: cobrancas.length,
      geradas,
      ignoradas,
    };
  }

  async gerarMensalidades(user: JwtPayloadUser, month?: string) {
    this.ensureCanManage(user);
    const workspaceId = requireWorkspaceId(user);
    return this.gerarMensalidadesCore({
      competencia: month,
      workspaceId,
      nutricionistaId:
        user.perfil === PerfilUsuario.nutricionista ? user.sub : undefined,
    });
  }

  /**
   * Saneamento diário: grava `atrasado` no banco.
   *
   * A leitura já deriva o status (é ela que garante o número certo na tela),
   * mas deixar a coluna coerente evita que qualquer consulta futura — relatório,
   * exportação, SQL avulso — veja um dado que não corresponde à realidade.
   */
  @Cron('10 3 * * *', { timeZone: 'America/Sao_Paulo' })
  async marcarVencidosComoAtrasados() {
    try {
      const hoje = this.hojeUtc();
      const resultado = await this.prisma.lancamentoFinanceiro.updateMany({
        where: {
          status: StatusLancamentoFinanceiro.pendente,
          vencimento: { lt: hoje },
        },
        data: { status: StatusLancamentoFinanceiro.atrasado },
      });
      if (resultado.count > 0) {
        this.logger.log(
          `Saneamento financeiro: ${resultado.count} lançamento(s) vencido(s) marcado(s) como atrasado.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha ao marcar vencidos como atrasados: ${message}`);
    }
  }

  /**
   * CSV do período filtrado, para mandar ao contador.
   *
   * Separador `;` e vírgula decimal porque é o que o Excel em português
   * entende sem pedir importação.
   */
  async exportarCsv(
    user: JwtPayloadUser,
    query: QueryLancamentosFinanceirosDto,
  ): Promise<string> {
    const rows = await this.list(user, query);
    const cabecalho = [
      'Vencimento',
      'Tipo',
      'Status',
      'Descrição',
      'Paciente',
      'Categoria',
      'Valor',
      'Pago em',
    ];
    const escapar = (v: unknown): string => {
      const texto = v == null ? '' : String(v);
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const linhas = rows.map((r) =>
      [
        r.vencimento,
        r.tipo,
        r.status,
        escapar(r.descricao),
        escapar(r.pacienteNome ?? ''),
        escapar(r.categoria ?? ''),
        r.valor.toFixed(2).replace('.', ','),
        r.pagoEm ?? '',
      ].join(';'),
    );
    // BOM para o Excel abrir os acentos corretamente em UTF-8.
    return '\uFEFF' + [cabecalho.join(';'), ...linhas].join('\r\n');
  }

  @Cron('5 0 1 * *', { timeZone: 'America/Sao_Paulo' })
  async gerarMensalidadesAutomaticamente() {
    if (process.env.FINANCEIRO_AUTO_GERAR_MENSALIDADES === '0') {
      this.logger.log('Geração automática de mensalidades desativada por ambiente.');
      return;
    }

    try {
      const resultado = await this.gerarMensalidadesCore({});
      this.logger.log(
        `Mensalidades automáticas ${resultado.competencia}: geradas=${resultado.geradas}, ignoradas=${resultado.ignoradas}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Falha na geração automática de mensalidades: ${message}`,
      );
    }
  }
}
