import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  PerfilUsuario,
  StatusLancamentoFinanceiro,
  TipoLancamentoFinanceiro,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../common/tenant/tenant-scope';

const APP_TIME_ZONE = 'America/Sao_Paulo';

function zonedDateParts(
  date: Date,
  timeZone: string,
): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (
    type: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second',
  ) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - date.getTime();
}

function zonedMidnightUtc(
  y: number,
  m: number,
  d: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const offset = tzOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function dayStart(d = new Date()): Date {
  const z = zonedDateParts(d, APP_TIME_ZONE);
  return zonedMidnightUtc(z.y, z.m, z.d, APP_TIME_ZONE);
}

function dayEnd(d = new Date()): Date {
  const start = dayStart(d);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Data (somente dia) no fuso do app, para comparação de colunas @db.Date. */
function dateOnlyUtc(d: Date): Date {
  const z = zonedDateParts(d, APP_TIME_ZONE);
  return new Date(Date.UTC(z.y, z.m - 1, z.d));
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Janela de 90 dias: acima disso o paciente não está em acompanhamento. */
const DIAS_ATIVO = 90;

/** Abaixo disso não vale ocupar a fila de contato. */
const DIAS_SEM_CONTATO_MIN = 21;

export type Periodo = 'mes' | '30d' | 'ano';

/**
 * Painel do consultório.
 *
 * Responde três perguntas, nesta ordem de importância:
 *   1. Quem eu preciso contatar hoje?   (fila de contato)
 *   2. Como está o meu dinheiro?        (recebido, a receber, vencendo)
 *   3. Estou crescendo?                 (período contra período anterior)
 *
 * Nenhum indicador é "desde sempre": total acumulado não mostra tendência,
 * e o consultório decide com tendência.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureProfissionalDashboard(user: JwtPayloadUser): void {
    if (
      user.perfil !== PerfilUsuario.nutricionista &&
      user.perfil !== PerfilUsuario.admin_clinica
    ) {
      throw new ForbiddenException('Acesso negado');
    }
  }

  private wherePaciente(user: JwtPayloadUser) {
    const wid = requireWorkspaceId(user);
    return user.perfil === PerfilUsuario.nutricionista
      ? { workspaceId: wid, idNutricionista: user.idNutricionista ?? user.sub }
      : { workspaceId: wid };
  }

  private whereConsulta(user: JwtPayloadUser) {
    const wid = requireWorkspaceId(user);
    const wherePaciente = this.wherePaciente(user);
    return user.perfil === PerfilUsuario.nutricionista
      ? {
          idNutricionista: user.idNutricionista ?? user.sub,
          paciente: { workspaceId: wid },
        }
      : { paciente: wherePaciente };
  }

  /** Intervalo do período e do período anterior equivalente, para comparar. */
  private intervalo(periodo: Periodo): {
    inicio: Date;
    fim: Date;
    inicioAnterior: Date;
    fimAnterior: Date;
    rotulo: string;
  } {
    const z = zonedDateParts(new Date(), APP_TIME_ZONE);

    if (periodo === 'mes') {
      const inicio = zonedMidnightUtc(z.y, z.m, 1, APP_TIME_ZONE);
      return {
        inicio,
        fim: dayEnd(),
        inicioAnterior: zonedMidnightUtc(z.y, z.m - 1, 1, APP_TIME_ZONE),
        fimAnterior: new Date(inicio.getTime() - 1),
        rotulo: 'Este mês',
      };
    }

    if (periodo === 'ano') {
      const inicio = zonedMidnightUtc(z.y, 1, 1, APP_TIME_ZONE);
      return {
        inicio,
        fim: dayEnd(),
        inicioAnterior: zonedMidnightUtc(z.y - 1, 1, 1, APP_TIME_ZONE),
        fimAnterior: new Date(inicio.getTime() - 1),
        rotulo: 'Este ano',
      };
    }

    // 30 dias: janela móvel contra os 30 dias imediatamente anteriores.
    const fim = dayEnd();
    const inicio = new Date(dayStart().getTime() - 29 * DIA_MS);
    const fimAnterior = new Date(inicio.getTime() - 1);
    return {
      inicio,
      fim,
      inicioAnterior: new Date(fimAnterior.getTime() - 29 * DIA_MS),
      fimAnterior,
      rotulo: 'Últimos 30 dias',
    };
  }

  async getStats(user: JwtPayloadUser, periodo: Periodo = '30d') {
    this.ensureProfissionalDashboard(user);
    const wherePaciente = this.wherePaciente(user);
    const consultaBase = this.whereConsulta(user);
    const wid = requireWorkspaceId(user);
    const { inicio, fim, inicioAnterior, fimAnterior, rotulo } =
      this.intervalo(periodo);
    const hojeInicio = dayStart();
    const hojeFim = dayEnd();

    const [
      totalPacientes,
      consultasHoje,
      consultasPeriodo,
      consultasAnterior,
      enviosPendentes,
      enviosRespondidos,
      enviosEnviados,
      novosPacientes,
      planosPrescritos,
      ultimoCheckinPorPaciente,
      ultimaConsultaPorPaciente,
    ] = await Promise.all([
      this.prisma.paciente.count({ where: wherePaciente }),

      this.prisma.consultaAgendada.count({
        where: { ...consultaBase, inicio: { gte: hojeInicio, lte: hojeFim } },
      }),

      this.prisma.consultaAgendada.count({
        where: { ...consultaBase, inicio: { gte: inicio, lte: fim } },
      }),

      this.prisma.consultaAgendada.count({
        where: {
          ...consultaBase,
          inicio: { gte: inicioAnterior, lte: fimAnterior },
        },
      }),

      this.prisma.envioFormulario.count({
        where: {
          paciente: wherePaciente,
          respondidoEm: null,
          enviadoEm: { not: null },
        },
      }),

      this.prisma.envioFormulario.count({
        where: { paciente: wherePaciente, respondidoEm: { gte: inicio, lte: fim } },
      }),

      this.prisma.envioFormulario.count({
        where: { paciente: wherePaciente, enviadoEm: { gte: inicio, lte: fim } },
      }),

      this.prisma.paciente.count({
        where: {
          ...wherePaciente,
          usuario: { criadoEm: { gte: inicio, lte: fim } },
        },
      }),

      // PlanoAlimentar não tem createdAt: a data de referência é a vigência.
      this.prisma.planoAlimentar.count({
        where: {
          paciente: wherePaciente,
          dataInicio: { gte: dateOnlyUtc(inicio), lte: dateOnlyUtc(fim) },
        },
      }),

      this.prisma.envioFormulario.groupBy({
        by: ['idPaciente'],
        where: { paciente: wherePaciente, respondidoEm: { not: null } },
        _max: { respondidoEm: true },
      }),

      this.prisma.consultaAgendada.groupBy({
        by: ['idPaciente'],
        where: consultaBase,
        _max: { inicio: true },
      }),
    ]);

    const taxaResposta =
      enviosEnviados > 0 ? Math.round((enviosRespondidos / enviosEnviados) * 100) : 0;

    const variacaoConsultas =
      consultasAnterior > 0
        ? Math.round(
            ((consultasPeriodo - consultasAnterior) / consultasAnterior) * 100,
          )
        : null;

    // ── Pacientes em acompanhamento ──
    // Ativo = consulta ou check-in nos últimos 90 dias. Cadastro parado não é
    // paciente ativo, é contato na base — e a diferença importa para saber
    // quantos realmente sustentam a receita.
    const checkinPorPaciente = new Map(
      ultimoCheckinPorPaciente.map((r) => [r.idPaciente, r._max.respondidoEm]),
    );
    const consultaPorPaciente = new Map(
      ultimaConsultaPorPaciente.map((r) => [r.idPaciente, r._max.inicio]),
    );
    const limiteAtivo = new Date(Date.now() - DIAS_ATIVO * DIA_MS);

    let pacientesAtivos = 0;
    for (const [id] of consultaPorPaciente) {
      const c = consultaPorPaciente.get(id);
      const k = checkinPorPaciente.get(id);
      const ultimo = c && k ? (c > k ? c : k) : (c ?? k);
      if (ultimo && ultimo >= limiteAtivo) pacientesAtivos++;
    }
    for (const [id] of checkinPorPaciente) {
      if (consultaPorPaciente.has(id)) continue;
      const k = checkinPorPaciente.get(id);
      if (k && k >= limiteAtivo) pacientesAtivos++;
    }

    // ── Dinheiro ──
    const hojeZ = zonedDateParts(new Date(), APP_TIME_ZONE);
    const mesKey = `${hojeZ.y}-${String(hojeZ.m).padStart(2, '0')}`;
    const hoje = dateOnlyUtc(new Date());
    const daquiSete = dateOnlyUtc(new Date(Date.now() + 7 * DIA_MS));

    const [recebido, aReceber, vencendo, atrasados] = await Promise.all([
      this.prisma.lancamentoFinanceiro.aggregate({
        where: {
          workspaceId: wid,
          tipo: TipoLancamentoFinanceiro.receita,
          status: StatusLancamentoFinanceiro.pago,
          vencimento: { gte: inicio, lte: fim },
        },
        _sum: { valor: true },
      }),
      this.prisma.lancamentoFinanceiro.aggregate({
        where: {
          workspaceId: wid,
          tipo: TipoLancamentoFinanceiro.receita,
          status: {
            in: [
              StatusLancamentoFinanceiro.pendente,
              StatusLancamentoFinanceiro.atrasado,
            ],
          },
          competencia: mesKey,
        },
        _sum: { valor: true },
      }),
      this.prisma.lancamentoFinanceiro.findMany({
        where: {
          workspaceId: wid,
          tipo: TipoLancamentoFinanceiro.receita,
          status: {
            in: [
              StatusLancamentoFinanceiro.pendente,
              StatusLancamentoFinanceiro.atrasado,
            ],
          },
          vencimento: { gte: hoje, lte: daquiSete },
        },
        orderBy: { vencimento: 'asc' },
        take: 8,
        select: {
          id: true,
          descricao: true,
          pacienteNome: true,
          valor: true,
          vencimento: true,
          idPaciente: true,
        },
      }),
      this.prisma.lancamentoFinanceiro.count({
        where: {
          workspaceId: wid,
          tipo: TipoLancamentoFinanceiro.receita,
          status: {
            in: [
              StatusLancamentoFinanceiro.pendente,
              StatusLancamentoFinanceiro.atrasado,
            ],
          },
          vencimento: { lt: hoje },
        },
      }),
    ]);

    return {
      periodo,
      rotuloPeriodo: rotulo,
      totalPacientes,
      pacientesAtivos,
      consultasHoje,
      consultasPeriodo,
      consultasAnterior,
      variacaoConsultas,
      checkinsPendentes: enviosPendentes,
      taxaResposta,
      novosPacientes,
      planosPrescritos,
      financeiro: {
        recebidoPeriodo: Math.round(recebido._sum.valor ?? 0),
        aReceberMes: Math.round(aReceber._sum.valor ?? 0),
        atrasados,
        vencendo: vencendo.map((v) => ({
          id: v.id,
          descricao: v.descricao,
          pacienteNome: v.pacienteNome,
          idPaciente: v.idPaciente,
          valor: Math.round(v.valor),
          vencimento: v.vencimento,
        })),
      },
    };
  }

  /**
   * Fila de contato: quem precisa de atenção HOJE.
   *
   * Ordenada pelo tempo sem contato, do mais sumido para o mais recente — é a
   * ordem em que se liga. O último sinal de vida do acompanhamento é o maior
   * entre: check-in respondido, consulta realizada e plano prescrito.
   */
  async getAlertas(user: JwtPayloadUser) {
    this.ensureProfissionalDashboard(user);
    const wherePaciente = this.wherePaciente(user);

    const pacientes = await this.prisma.paciente.findMany({
      where: wherePaciente,
      include: {
        usuario: { select: { criadoEm: true, email: true } },
        enviosFormulario: {
          where: { respondidoEm: { not: null } },
          orderBy: { respondidoEm: 'desc' },
          take: 1,
          select: { respondidoEm: true },
        },
        consultasAgendadas: {
          orderBy: { inicio: 'desc' },
          take: 1,
          select: { inicio: true },
        },
        planosAlimentares: {
          orderBy: { dataInicio: 'desc' },
          take: 1,
          select: { dataInicio: true },
        },
      },
    });

    const alertas: Array<{
      idPaciente: number;
      nome: string;
      iniciais: string;
      issue: string;
      severity: 'high' | 'medium' | 'low';
      diasSemContato: number;
      celular: string | null;
      motivo: 'sem_checkin' | 'sem_consulta' | 'nunca_atendido';
    }> = [];

    for (const p of pacientes) {
      const ultimoCheckin = p.enviosFormulario[0]?.respondidoEm ?? null;
      const ultimaConsulta = p.consultasAgendadas[0]?.inicio ?? null;
      const ultimoPlano = p.planosAlimentares[0]?.dataInicio ?? null;

      const datas = [ultimoCheckin, ultimaConsulta, ultimoPlano].filter(
        (d): d is Date => d != null,
      );
      const ultimoContato = datas.length
        ? new Date(Math.max(...datas.map((d) => d.getTime())))
        : null;

      const diasSemContato = ultimoContato
        ? Math.floor((Date.now() - ultimoContato.getTime()) / DIA_MS)
        : 999;

      const nuncaAtendido = ultimoContato == null;
      if (!nuncaAtendido && diasSemContato < DIAS_SEM_CONTATO_MIN) continue;

      const nome = p.nome?.trim() || p.usuario.email;
      const partes = nome.split(/\s+/).filter(Boolean);
      const iniciais =
        partes.length >= 2
          ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
          : nome.slice(0, 2).toUpperCase();

      const motivo: 'sem_checkin' | 'sem_consulta' | 'nunca_atendido' =
        nuncaAtendido
          ? 'nunca_atendido'
          : !ultimoCheckin
            ? 'sem_checkin'
            : 'sem_consulta';

      const issue = nuncaAtendido
        ? 'Cadastrou e nunca foi atendido'
        : diasSemContato >= 365
          ? 'Sem contato há mais de 1 ano'
          : `Sem contato há ${diasSemContato} dias`;

      alertas.push({
        idPaciente: p.id,
        nome,
        iniciais,
        issue,
        severity:
          nuncaAtendido || diasSemContato >= DIAS_ATIVO
            ? 'high'
            : diasSemContato >= 45
              ? 'medium'
              : 'low',
        diasSemContato,
        celular: p.celular ?? null,
        motivo,
      });
    }

    return alertas
      .sort((a, b) => b.diasSemContato - a.diasSemContato)
      .slice(0, 12);
  }

  async getAgenda(user: JwtPayloadUser) {
    this.ensureProfissionalDashboard(user);
    const rows = await this.prisma.consultaAgendada.findMany({
      where: {
        ...this.whereConsulta(user),
        inicio: { gte: dayStart(), lte: dayEnd() },
      },
      include: {
        paciente: { include: { usuario: { select: { email: true } } } },
      },
      orderBy: { inicio: 'asc' },
      take: 8,
    });

    return rows.map((r) => {
      const nome = r.paciente.nome?.trim() || r.paciente.usuario.email;
      const parts = nome.split(/\s+/).filter(Boolean);
      const iniciais =
        parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : nome.slice(0, 2).toUpperCase();
      return {
        idPaciente: r.idPaciente,
        nome,
        time: hhmm(r.inicio),
        type: r.observacao?.trim() || 'Consulta',
        iniciais,
      };
    });
  }
}
