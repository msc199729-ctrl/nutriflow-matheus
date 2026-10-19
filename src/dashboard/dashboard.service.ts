import { ForbiddenException, Injectable } from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
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

function zonedMidnightUtc(y: number, m: number, d: number, timeZone: string): Date {
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
      ? { workspaceId: wid, idNutricionista: user.sub }
      : { workspaceId: wid };
  }

  private whereConsulta(user: JwtPayloadUser) {
    const wid = requireWorkspaceId(user);
    const wherePaciente = this.wherePaciente(user);
    return user.perfil === PerfilUsuario.nutricionista
      ? { idNutricionista: user.sub, paciente: { workspaceId: wid } }
      : { paciente: wherePaciente };
  }

  async getStats(user: JwtPayloadUser) {
    this.ensureProfissionalDashboard(user);
    const wherePaciente = this.wherePaciente(user);
    const hojeInicio = dayStart();
    const hojeFim = dayEnd();

    const [
      totalPacientes,
      enviosPendentes,
      enviosRespondidos,
      enviosTotal,
      consultasHoje,
    ] = await Promise.all([
      this.prisma.paciente.count({ where: wherePaciente }),
      this.prisma.envioFormulario.count({
        where: {
          paciente: wherePaciente,
          respondidoEm: null,
          enviadoEm: { not: null },
        },
      }),
      this.prisma.envioFormulario.count({
        where: {
          paciente: wherePaciente,
          respondidoEm: { not: null },
        },
      }),
      this.prisma.envioFormulario.count({
        where: { paciente: wherePaciente },
      }),
      this.prisma.consultaAgendada.count({
        where: {
          ...this.whereConsulta(user),
          inicio: {
            gte: hojeInicio,
            lte: hojeFim,
          },
        },
      }),
    ]);

    const taxaAdesao =
      enviosTotal > 0 ? Math.round((enviosRespondidos / enviosTotal) * 100) : 0;

    return {
      totalPacientes,
      consultasHoje,
      checkinsPendentes: enviosPendentes,
      taxaAdesao,
    };
  }

  async getAlertas(user: JwtPayloadUser) {
    this.ensureProfissionalDashboard(user);
    const wherePaciente = this.wherePaciente(user);

    const pacientes = await this.prisma.paciente.findMany({
      where: wherePaciente,
      include: {
        usuario: { select: { criadoEm: true } },
        enviosFormulario: {
          where: { respondidoEm: { not: null } },
          orderBy: { respondidoEm: 'desc' },
          take: 1,
        },
      },
    });

    const alertas: Array<{
      idPaciente: number;
      nome: string;
      iniciais: string;
      issue: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    for (const p of pacientes) {
      const ultimoCheckin = p.enviosFormulario[0]?.respondidoEm;
      const diasSemCheckin = ultimoCheckin
        ? Math.floor(
            (Date.now() - ultimoCheckin.getTime()) / (1000 * 60 * 60 * 24),
          )
        : 999;

      if (diasSemCheckin >= 7) {
        const iniciais = (p.nome ?? '?')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const initials =
          iniciais.length >= 2
            ? (iniciais[0][0] + iniciais[iniciais.length - 1][0]).toUpperCase()
            : (p.nome ?? '?').slice(0, 2).toUpperCase();

        alertas.push({
          idPaciente: p.id,
          nome: p.nome ?? `Paciente #${p.id}`,
          iniciais: initials,
          issue:
            diasSemCheckin >= 14
              ? `Sem check-in h ${diasSemCheckin} dias`
              : 'Sem check-in h 7 dias',
          severity: diasSemCheckin >= 14 ? 'high' : 'medium',
        });
      }
    }

    return alertas.slice(0, 10);
  }

  async getAgenda(user: JwtPayloadUser) {
    this.ensureProfissionalDashboard(user);
    const rows = await this.prisma.consultaAgendada.findMany({
      where: {
        ...this.whereConsulta(user),
        inicio: {
          gte: dayStart(),
          lte: dayEnd(),
        },
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
        nome,
        time: hhmm(r.inicio),
        type: r.observacao?.trim() || 'Consulta',
        iniciais,
      };
    });
  }
}
