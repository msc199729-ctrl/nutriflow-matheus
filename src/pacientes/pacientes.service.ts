import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { basename, join } from 'path';
import { unlinkSync } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PerfilUsuario } from '@prisma/client';
import { CreatePacienteDto } from './dto/create-paciente.dto';
import { UpdatePacienteDto } from './dto/update-paciente.dto';
import {
  countPacientesPorPlano,
  normalizarPlanoSaas,
  SAAS_LIMITE_PACIENTES,
} from '../common/saas-plans.util';
import {
  isAdminSistema,
  requireWorkspaceId,
  wherePacientesParaProfissional,
} from '../common/tenant/tenant-scope';
import { CreateNotaClinicaDto } from './dto/create-nota-clinica.dto';

@Injectable()
export class PacientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  private resolveNutricionistaParaCriacao(
    dto: CreatePacienteDto,
    user: JwtPayloadUser,
  ): number {
    if (user.perfil === PerfilUsuario.nutricionista) {
      return user.sub;
    }
    if (user.perfil === PerfilUsuario.admin_clinica) {
      if (dto.idNutricionistaResponsavel == null) {
        throw new BadRequestException(
          'Informe idNutricionistaResponsavel para criar paciente como gestor da clínica',
        );
      }
      return dto.idNutricionistaResponsavel;
    }
    throw new ForbiddenException('Sem permissão para criar pacientes');
  }

  async findAll(
    user: JwtPayloadUser,
    page: number = 1,
    limit: number = 10,
  ) {
    const where = wherePacientesParaProfissional(user);
    const skip = (page - 1) * limit;
    const [data, total, totalEnvios, enviosRespondidos] = await Promise.all([
      this.prisma.paciente.findMany({
        where,
        include: {
          usuario: { select: { email: true, criadoEm: true } },
          cobrancaMensal: true,
        },
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.paciente.count({ where }),
      this.prisma.envioFormulario.groupBy({
        by: ['idPaciente'],
        where: { paciente: where },
        _count: { id: true },
      }),
      this.prisma.envioFormulario.groupBy({
        by: ['idPaciente'],
        where: { paciente: { ...where }, respondidoEm: { not: null } },
        _count: { id: true },
      }),
    ]);
    const totalMap = new Map(totalEnvios.map((t) => [t.idPaciente, t._count.id]));
    const respondedMap = new Map(
      enviosRespondidos.map((r) => [r.idPaciente, r._count.id]),
    );
    return {
      data: data.map((p) => {
        const tot = totalMap.get(p.id) ?? 0;
        const resp = respondedMap.get(p.id) ?? 0;
        const adesaoPercentual = tot > 0 ? Math.round((resp / tot) * 100) : null;
        return {
          id: p.id,
          idNutricionista: p.idNutricionista,
          email: p.usuario.email,
          nome: p.nome,
          cpf: p.cpf,
          celular: p.celular,
          dataNascimento: p.dataNascimento?.toISOString().slice(0, 10) ?? null,
          genero: p.genero,
          objetivo: p.objetivo,
          notasClinicas: p.notasClinicas,
          cobrancaMensal: p.cobrancaMensal
            ? {
                ativa: p.cobrancaMensal.ativa,
                valorMensal: p.cobrancaMensal.valorMensal,
                diaVencimento: p.cobrancaMensal.diaVencimento,
                inicioCobranca: p.cobrancaMensal.inicioCobranca
                  .toISOString()
                  .slice(0, 10),
                categoria: p.cobrancaMensal.categoria,
                observacoes: p.cobrancaMensal.observacoes,
              }
            : null,
          adesaoPercentual,
          criadoEm: p.usuario.criadoEm.toISOString(),
        };
      }),
      total,
    };
  }

  /** Paciente do tenant (para agendamentos e outros módulos). */
  async findOneForAgendamento(idPaciente: number, user: JwtPayloadUser) {
    const p = await this.findPacienteInTenantOrThrow(idPaciente, user);
    return { id: p.id, idNutricionista: p.idNutricionista };
  }

  async findOne(id: number, user: JwtPayloadUser) {
    const paciente = await this.findPacienteInTenantOrThrow(id, user);
    const [total, responded] = await Promise.all([
      this.prisma.envioFormulario.count({ where: { idPaciente: id } }),
      this.prisma.envioFormulario.count({
        where: { idPaciente: id, respondidoEm: { not: null } },
      }),
    ]);
    const adesaoPercentual = total > 0 ? Math.round((responded / total) * 100) : null;
    return {
      id: paciente.id,
      idNutricionista: paciente.idNutricionista,
      email: paciente.usuario.email,
      nome: paciente.nome,
      cpf: paciente.cpf,
      celular: paciente.celular,
      dataNascimento: paciente.dataNascimento?.toISOString().slice(0, 10) ?? null,
      genero: paciente.genero,
      objetivo: paciente.objetivo,
      notasClinicas: paciente.notasClinicas,
      urlFotoPerfil: paciente.urlFotoPerfil ?? null,
      cobrancaMensal: paciente.cobrancaMensal
        ? {
            ativa: paciente.cobrancaMensal.ativa,
            valorMensal: paciente.cobrancaMensal.valorMensal,
            diaVencimento: paciente.cobrancaMensal.diaVencimento,
            inicioCobranca: paciente.cobrancaMensal.inicioCobranca
              .toISOString()
              .slice(0, 10),
            categoria: paciente.cobrancaMensal.categoria,
            observacoes: paciente.cobrancaMensal.observacoes,
          }
        : null,
      adesaoPercentual,
      criadoEm: paciente.usuario.criadoEm.toISOString(),
    };
  }

  /**
   * Atualiza foto de perfil (arquivo já salvo em disco pelo controller).
   */
  async updateFotoPerfilFromUpload(
    idPaciente: number,
    user: JwtPayloadUser,
    absoluteFilePath: string,
  ) {
    await this.findPacienteInTenantOrThrow(idPaciente, user);
    const filename = basename(absoluteFilePath);
    const publicPath = `/static/paciente-perfil/${filename}`;

    const current = await this.prisma.paciente.findUnique({
      where: { id: idPaciente },
      select: { urlFotoPerfil: true },
    });
    const prev = current?.urlFotoPerfil;
    if (prev?.startsWith('/static/paciente-perfil/')) {
      const oldName = basename(prev);
      const oldAbs = join(process.cwd(), 'uploads', 'paciente-perfil', oldName);
      try {
        unlinkSync(oldAbs);
      } catch {
        /* arquivo já removido */
      }
    }

    await this.prisma.paciente.update({
      where: { id: idPaciente },
      data: { urlFotoPerfil: publicPath },
    });
    return this.findOne(idPaciente, user);
  }

  private async findPacienteInTenantOrThrow(id: number, user: JwtPayloadUser) {
    if (user.perfil === PerfilUsuario.paciente && id !== user.sub) {
      throw new ForbiddenException('Acesso negado.');
    }

    if (isAdminSistema(user)) {
      const paciente = await this.prisma.paciente.findUnique({
        where: { id },
        include: {
          usuario: { select: { email: true, criadoEm: true } },
          cobrancaMensal: true,
        },
      });
      if (!paciente) throw new NotFoundException('Paciente não encontrado');
      return paciente;
    }

    const wid = requireWorkspaceId(user);
    const paciente = await this.prisma.paciente.findFirst({
      where: {
        id,
        workspaceId: wid,
        ...(user.perfil === PerfilUsuario.nutricionista
          ? { idNutricionista: user.sub }
          : {}),
      },
      include: {
        usuario: { select: { email: true, criadoEm: true } },
        cobrancaMensal: true,
      },
    });
    if (!paciente) throw new NotFoundException('Paciente não encontrado');
    return paciente;
  }

  async create(dto: CreatePacienteDto, user: JwtPayloadUser) {
    const idNutricionista = this.resolveNutricionistaParaCriacao(dto, user);
    const workspaceId = requireWorkspaceId(user);

    if (user.perfil === PerfilUsuario.admin_clinica) {
      const ok = await this.prisma.nutricionista.findFirst({
        where: { id: idNutricionista, usuario: { workspaceId } },
      });
      if (!ok) {
        throw new ForbiddenException('Nutricionista não pertence ao seu workspace');
      }
    }

    if (!isAdminSistema(user)) {
      const nut = await this.prisma.nutricionista.findUnique({
        where: { id: idNutricionista },
        select: { planoSaas: true },
      });
      const plano = normalizarPlanoSaas(nut?.planoSaas);
      const atual = await countPacientesPorPlano(this.prisma, {
        workspaceId,
        plano,
        idNutricionista,
      });
      const lim = SAAS_LIMITE_PACIENTES[plano];
      if (atual >= lim) {
        throw new ForbiddenException(
          `Limite de pacientes do plano atingido (${lim}). Atualize o plano ou fale com o suporte.`,
        );
      }
    }

    const senhaHash = await this.usersService.hashPassword(dto.senha);
    const created = await this.usersService.createUsuario({
      email: dto.email,
      senhaHash,
      perfil: PerfilUsuario.paciente,
      workspaceId,
      nome: dto.nome,
      idNutricionista,
    });
    const pacienteId = created.paciente?.id ?? created.id;
    await this.prisma.paciente.update({
      where: { id: pacienteId },
      data: {
        nome: dto.nome ?? undefined,
        cpf: dto.cpf ?? undefined,
        celular: dto.celular ?? undefined,
        dataNascimento: dto.dataNascimento ? new Date(dto.dataNascimento) : undefined,
        genero: dto.genero ?? undefined,
        objetivo: dto.objetivo ?? undefined,
        notasClinicas: dto.notasClinicas ?? undefined,
      },
    });
    if (dto.cobrancaMensal) {
      await this.prisma.cobrancaPaciente.create({
        data: {
          idPaciente: pacienteId,
          workspaceId,
          ativa: dto.cobrancaMensal.ativa ?? true,
          valorMensal: dto.cobrancaMensal.valorMensal,
          diaVencimento: dto.cobrancaMensal.diaVencimento,
          inicioCobranca: new Date(dto.cobrancaMensal.inicioCobranca),
          categoria: dto.cobrancaMensal.categoria?.trim() || 'Mensalidade',
          observacoes: dto.cobrancaMensal.observacoes?.trim() || null,
        },
      });
    }
    return this.findOne(pacienteId, user);
  }

  async update(id: number, dto: UpdatePacienteDto, user: JwtPayloadUser) {
    await this.findOne(id, user);
    const workspaceId = requireWorkspaceId(user);
    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.cpf !== undefined) data.cpf = dto.cpf;
    if (dto.celular !== undefined) data.celular = dto.celular;
    if (dto.dataNascimento !== undefined) data.dataNascimento = dto.dataNascimento ? new Date(dto.dataNascimento) : null;
    if (dto.genero !== undefined) data.genero = dto.genero;
    if (dto.objetivo !== undefined) data.objetivo = dto.objetivo;
    if (dto.notasClinicas !== undefined) data.notasClinicas = dto.notasClinicas;
    await this.prisma.paciente.update({
      where: { id },
      data,
    });
    if (dto.cobrancaMensal !== undefined) {
      if (dto.cobrancaMensal === null) {
        await this.prisma.cobrancaPaciente.deleteMany({ where: { idPaciente: id } });
      } else {
        const current = await this.prisma.cobrancaPaciente.findUnique({
          where: { idPaciente: id },
        });
        if (!current) {
          if (
            dto.cobrancaMensal.valorMensal == null ||
            dto.cobrancaMensal.diaVencimento == null ||
            !dto.cobrancaMensal.inicioCobranca
          ) {
            throw new BadRequestException(
              'Para criar cobrança mensal, informe valorMensal, diaVencimento e inicioCobranca.',
            );
          }
          await this.prisma.cobrancaPaciente.create({
            data: {
              idPaciente: id,
              workspaceId,
              ativa: dto.cobrancaMensal.ativa ?? true,
              valorMensal: dto.cobrancaMensal.valorMensal,
              diaVencimento: dto.cobrancaMensal.diaVencimento,
              inicioCobranca: new Date(dto.cobrancaMensal.inicioCobranca),
              categoria: dto.cobrancaMensal.categoria?.trim() || 'Mensalidade',
              observacoes: dto.cobrancaMensal.observacoes?.trim() || null,
            },
          });
        } else {
          await this.prisma.cobrancaPaciente.update({
            where: { idPaciente: id },
            data: {
              ativa: dto.cobrancaMensal.ativa ?? undefined,
              valorMensal: dto.cobrancaMensal.valorMensal ?? undefined,
              diaVencimento: dto.cobrancaMensal.diaVencimento ?? undefined,
              inicioCobranca: dto.cobrancaMensal.inicioCobranca
                ? new Date(dto.cobrancaMensal.inicioCobranca)
                : undefined,
              categoria:
                dto.cobrancaMensal.categoria !== undefined
                  ? dto.cobrancaMensal.categoria.trim() || 'Mensalidade'
                  : undefined,
              observacoes:
                dto.cobrancaMensal.observacoes !== undefined
                  ? dto.cobrancaMensal.observacoes.trim() || null
                  : undefined,
            },
          });
        }
      }
    }
    return this.findOne(id, user);
  }

  async remove(id: number, user: JwtPayloadUser) {
    await this.findOne(id, user);
    await this.prisma.usuario.delete({ where: { id } });
  }

  private ensureProfissionalParaNotas(user: JwtPayloadUser): void {
    if (user.perfil === PerfilUsuario.paciente) {
      throw new ForbiddenException('Acesso negado às notas clínicas');
    }
    if (
      user.perfil !== PerfilUsuario.nutricionista &&
      user.perfil !== PerfilUsuario.admin_clinica &&
      !isAdminSistema(user)
    ) {
      throw new ForbiddenException('Sem permissão para notas clínicas');
    }
  }

  async listNotasClinicas(idPaciente: number, user: JwtPayloadUser, tipo?: string) {
    await this.findPacienteInTenantOrThrow(idPaciente, user);
    this.ensureProfissionalParaNotas(user);
    const rows = await this.prisma.notaClinica.findMany({
      where: { idPaciente, ...(tipo ? { tipo } : {}) },
      orderBy: { criadoEm: 'desc' },
      include: {
        autor: {
          select: {
            id: true,
            email: true,
            nutricionista: { select: { nome: true } },
          },
        },
      },
    });
    return rows.map((n) => ({
      id: n.id,
      idPaciente: n.idPaciente,
      conteudo: n.conteudo,
      tipo: n.tipo,
      criadoEm: n.criadoEm.toISOString(),
      autor: {
        id: n.autor.id,
        email: n.autor.email,
        nome: n.autor.nutricionista?.nome ?? null,
      },
    }));
  }

  async createNotaClinica(
    idPaciente: number,
    dto: CreateNotaClinicaDto,
    user: JwtPayloadUser,
  ) {
    await this.findPacienteInTenantOrThrow(idPaciente, user);
    this.ensureProfissionalParaNotas(user);
    const conteudo = dto.conteudo.trim();
    if (!conteudo) {
      throw new BadRequestException('Conteúdo da nota não pode ser vazio');
    }
    const n = await this.prisma.notaClinica.create({
      data: {
        idPaciente,
        conteudo,
        tipo: dto.tipo ?? 'consulta',
        idAutor: user.sub,
      },
      include: {
        autor: {
          select: {
            id: true,
            email: true,
            nutricionista: { select: { nome: true } },
          },
        },
      },
    });
    return {
      id: n.id,
      idPaciente: n.idPaciente,
      conteudo: n.conteudo,
      tipo: n.tipo,
      criadoEm: n.criadoEm.toISOString(),
      autor: {
        id: n.autor.id,
        email: n.autor.email,
        nome: n.autor.nutricionista?.nome ?? null,
      },
    };
  }

  async removeNotaClinica(
    idPaciente: number,
    notaId: number,
    user: JwtPayloadUser,
  ) {
    await this.findPacienteInTenantOrThrow(idPaciente, user);
    this.ensureProfissionalParaNotas(user);
    const nota = await this.prisma.notaClinica.findFirst({
      where: { id: notaId, idPaciente },
    });
    if (!nota) {
      throw new NotFoundException('Nota não encontrada');
    }
    await this.prisma.notaClinica.delete({ where: { id: notaId } });
  }
}
