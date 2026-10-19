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

  private monthBounds(month: string): { start: Date; end: Date } {
    const [y, m] = month.split('-').map((v) => Number(v));
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    return { start, end };
  }

  private currentMonthKey(): string {
    return new Date().toISOString().slice(0, 7);
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
  }) {
    return {
      id: row.id,
      idPaciente: row.idPaciente,
      descricao: row.descricao,
      pacienteNome: row.pacienteNome,
      categoria: row.categoria,
      tipo: row.tipo,
      status: row.status,
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
      ...(query.status ? { status: query.status } : {}),
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
    const rows = await this.prisma.lancamentoFinanceiro.findMany({
      where: this.whereByUserAndQuery(user, query),
      orderBy: [{ vencimento: 'asc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.mapLancamento(row));
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
    if (dto.vencimento !== undefined) data.vencimento = this.normalizeDay(dto.vencimento);
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
        pagoEm: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
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

    const inMonth = await this.prisma.lancamentoFinanceiro.findMany({
      where: inMonthWhere,
      select: { tipo: true, status: true, valor: true },
    });

    const receitaPrevista = inMonth
      .filter((x) => x.tipo === 'receita')
      .reduce((sum, x) => sum + x.valor, 0);
    const receitaRecebida = inMonth
      .filter((x) => x.tipo === 'receita' && x.status === 'pago')
      .reduce((sum, x) => sum + x.valor, 0);
    const despesasPagas = inMonth
      .filter((x) => x.tipo === 'despesa' && x.status === 'pago')
      .reduce((sum, x) => sum + x.valor, 0);
    const atrasados = inMonth
      .filter((x) => x.status === 'atrasado')
      .reduce((sum, x) => sum + x.valor, 0);

    const upcomingEnd = new Date();
    upcomingEnd.setDate(upcomingEnd.getDate() + 7);
    const upcomingRows = await this.prisma.lancamentoFinanceiro.findMany({
      where: {
        ...whereBase,
        status: { not: 'pago' },
        vencimento: {
          gte: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
          lte: new Date(upcomingEnd.toISOString().slice(0, 10) + 'T00:00:00.000Z'),
        },
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
          select: { tipo: true, valor: true },
        });
        const receitas = rows
          .filter((x) => x.tipo === 'receita')
          .reduce((sum, x) => sum + x.valor, 0);
        const despesas = rows
          .filter((x) => x.tipo === 'despesa')
          .reduce((sum, x) => sum + x.valor, 0);
        return {
          mes: key,
          label: d.toLocaleDateString('pt-BR', { month: 'short' }),
          receitas,
          despesas,
          saldo: receitas - despesas,
        };
      }),
    );

    return {
      mes,
      totais: {
        receitaPrevista,
        receitaRecebida,
        despesasPagas,
        saldoReal: receitaRecebida - despesasPagas,
        atrasados,
      },
      proximosVencimentos: upcomingRows.map((x) => this.mapLancamento(x)),
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
