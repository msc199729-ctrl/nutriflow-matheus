import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import {
  isAdminSistema,
  requireWorkspaceId,
} from '../common/tenant/tenant-scope';
import { PacientesService } from '../pacientes/pacientes.service';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { QueryAgendamentosDto } from './dto/query-agendamentos.dto';

const APP_TIME_ZONE = 'America/Sao_Paulo';
const ISO_INSTANT_WITH_TIMEZONE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

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
  const get = (type: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second') =>
    Number(parts.find((p) => p.type === type)?.value);
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

function zonedDayStart(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return zonedMidnightUtc(y, m, d, APP_TIME_ZONE);
}

function zonedDayEnd(ymd: string): Date {
  const start = zonedDayStart(ymd);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function localYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: 'year' | 'month' | 'day') =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function defaultRange(): { de: string; ate: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(now);
  end.setDate(end.getDate() + 60);
  return { de: localYmd(start), ate: localYmd(end) };
}

function parseIsoInstantOrThrow(value: string): Date {
  if (!ISO_INSTANT_WITH_TIMEZONE_RE.test(value)) {
    throw new BadRequestException(
      'Data/hora inválida: informe um ISO 8601 com timezone (ex.: 2026-03-23T23:30:00-03:00)',
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Data/hora inválida');
  }
  return parsed;
}

@Injectable()
export class AgendamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pacientesService: PacientesService,
  ) {}

  private ensureProfissional(user: JwtPayloadUser): void {
    if (
      user.perfil !== PerfilUsuario.nutricionista &&
      user.perfil !== PerfilUsuario.admin_clinica
    ) {
      throw new ForbiddenException('Acesso negado');
    }
  }

  /** Leitura de agenda: paciente (só os próprios), nutricionista ou admin da clínica. */
  private ensurePodeLerAgendamentos(user: JwtPayloadUser): void {
    if (
      user.perfil !== PerfilUsuario.paciente &&
      user.perfil !== PerfilUsuario.nutricionista &&
      user.perfil !== PerfilUsuario.admin_clinica
    ) {
      throw new ForbiddenException('Acesso negado');
    }
  }

  private whereParaListagem(user: JwtPayloadUser) {
    if (isAdminSistema(user)) {
      throw new ForbiddenException('Use o painel administrativo');
    }
    const wid = requireWorkspaceId(user);
    if (user.perfil === PerfilUsuario.paciente) {
      return {
        idPaciente: user.sub,
        paciente: { workspaceId: wid },
      };
    }
    if (user.perfil === PerfilUsuario.nutricionista) {
      return {
        idNutricionista: user.sub,
        paciente: { workspaceId: wid },
      };
    }
    return { paciente: { workspaceId: wid } };
  }

  private async findAgendamentoOrThrow(id: number, user: JwtPayloadUser) {
    const row = await this.prisma.consultaAgendada.findFirst({
      where: {
        id,
        ...this.whereParaListagem(user),
      },
      include: {
        paciente: { include: { usuario: { select: { email: true } } } },
      },
    });
    if (!row) throw new NotFoundException('Agendamento não encontrado');
    return row;
  }

  private mapRow(row: {
    id: number;
    idPaciente: number;
    inicio: Date;
    observacao: string | null;
    criadoEm: Date;
    atualizadoEm: Date;
    paciente: {
      id: number;
      nome: string | null;
      usuario: { email: string };
    };
  }) {
    return {
      id: row.id,
      idPaciente: row.idPaciente,
      inicio: row.inicio.toISOString(),
      observacao: row.observacao,
      criadoEm: row.criadoEm.toISOString(),
      atualizadoEm: row.atualizadoEm.toISOString(),
      paciente: {
        id: row.paciente.id,
        nome: row.paciente.nome,
        email: row.paciente.usuario.email,
      },
    };
  }

  async findAll(user: JwtPayloadUser, query: QueryAgendamentosDto) {
    this.ensurePodeLerAgendamentos(user);
    const fb = defaultRange();
    const rangeDe = query.de ?? fb.de;
    const rangeAte = query.ate ?? fb.ate;
    const gte = zonedDayStart(rangeDe);
    const lte = zonedDayEnd(rangeAte);
    const rows = await this.prisma.consultaAgendada.findMany({
      where: {
        ...this.whereParaListagem(user),
        inicio: { gte, lte },
      },
      include: {
        paciente: { include: { usuario: { select: { email: true } } } },
      },
      orderBy: { inicio: 'asc' },
    });
    return rows.map((r) => this.mapRow(r));
  }

  async findOne(id: number, user: JwtPayloadUser) {
    this.ensurePodeLerAgendamentos(user);
    const row = await this.findAgendamentoOrThrow(id, user);
    return this.mapRow(row);
  }

  async create(dto: CreateAgendamentoDto, user: JwtPayloadUser) {
    this.ensureProfissional(user);
    const paciente = await this.pacientesService.findOneForAgendamento(
      dto.idPaciente,
      user,
    );
    const inicio = parseIsoInstantOrThrow(dto.inicio);
    const row = await this.prisma.consultaAgendada.create({
      data: {
        idPaciente: paciente.id,
        idNutricionista: paciente.idNutricionista,
        inicio,
        observacao: dto.observacao?.trim() || null,
      },
      include: {
        paciente: { include: { usuario: { select: { email: true } } } },
      },
    });
    return this.mapRow(row);
  }

  async update(id: number, dto: UpdateAgendamentoDto, user: JwtPayloadUser) {
    this.ensureProfissional(user);
    await this.findAgendamentoOrThrow(id, user);
    const data: {
      inicio?: Date;
      observacao?: string | null;
    } = {};
    if (dto.inicio !== undefined) {
      const d = parseIsoInstantOrThrow(dto.inicio);
      data.inicio = d;
    }
    if (dto.observacao !== undefined) {
      data.observacao = dto.observacao?.trim() || null;
    }
    const row = await this.prisma.consultaAgendada.update({
      where: { id },
      data,
      include: {
        paciente: { include: { usuario: { select: { email: true } } } },
      },
    });
    return this.mapRow(row);
  }

  async remove(id: number, user: JwtPayloadUser) {
    this.ensureProfissional(user);
    await this.findAgendamentoOrThrow(id, user);
    await this.prisma.consultaAgendada.delete({ where: { id } });
    return { ok: true };
  }
}
