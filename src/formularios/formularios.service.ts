import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PerfilUsuario, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import {
  isAdminSistema,
  requireWorkspaceId,
} from '../common/tenant/tenant-scope';
import { CreateModeloFormularioDto } from './dto/create-modelo-formulario.dto';
import { UpdateModeloFormularioDto } from './dto/update-modelo-formulario.dto';
import { CreatePerguntaDto } from './dto/create-pergunta.dto';
import { UpdatePerguntaDto } from './dto/update-pergunta.dto';
import { CreateEnvioDto } from './dto/create-envio.dto';
import { SubmitRespostasDto } from './dto/submit-respostas.dto';

@Injectable()
export class FormulariosService {
  constructor(private readonly prisma: PrismaService) {}

  private podeGerirModelos(user: JwtPayloadUser): boolean {
    return (
      user.perfil === PerfilUsuario.nutricionista ||
      user.perfil === PerfilUsuario.admin_clinica
    );
  }

  private async ensureModeloNoTenant(idModelo: number, user: JwtPayloadUser): Promise<void> {
    if (isAdminSistema(user)) return;
    if (!this.podeGerirModelos(user)) {
      throw new ForbiddenException('Acesso negado');
    }
    const wid = requireWorkspaceId(user);
    const modelo = await this.prisma.modeloFormulario.findFirst({
      where: { id: idModelo, workspaceId: wid },
    });
    if (!modelo) {
      throw new ForbiddenException('Modelo não encontrado ou não pertence ao workspace');
    }
  }

  private async ensureProfissionalAcessoPaciente(
    idPaciente: number,
    user: JwtPayloadUser,
  ): Promise<void> {
    if (isAdminSistema(user)) return;
    if (!this.podeGerirModelos(user)) {
      throw new ForbiddenException('Acesso negado');
    }
    const wid = requireWorkspaceId(user);
    const paciente = await this.prisma.paciente.findFirst({
      where: {
        id: idPaciente,
        workspaceId: wid,
        ...(user.perfil === PerfilUsuario.nutricionista
          ? { idNutricionista: user.sub }
          : {}),
      },
    });
    if (!paciente) {
      throw new ForbiddenException('Paciente não encontrado ou sem permissão');
    }
  }

  private async ensureEnvioAccess(
    idEnvio: number,
    user: JwtPayloadUser,
    includePerguntas = false,
  ) {
    const envio = await this.prisma.envioFormulario.findUnique({
      where: { id: idEnvio },
      include: {
        modelo: includePerguntas ? { include: { perguntas: { orderBy: { id: 'asc' } } } } : true,
        paciente: true,
        ...(includePerguntas
          ? {
              respostas: {
                orderBy: { id: 'asc' },
                include: { pergunta: true },
              },
            }
          : {}),
      },
    });
    if (!envio) throw new NotFoundException('Envio não encontrado');
    if (isAdminSistema(user)) return envio;
    if (user.perfil === PerfilUsuario.paciente && envio.idPaciente === user.sub) {
      return envio;
    }
    if (this.podeGerirModelos(user)) {
      const wid = requireWorkspaceId(user);
      if (envio.modelo.workspaceId !== wid) {
        throw new ForbiddenException('Acesso negado a este envio');
      }
      if (
        user.perfil === PerfilUsuario.nutricionista &&
        envio.paciente.idNutricionista !== user.sub
      ) {
        throw new ForbiddenException('Acesso negado a este envio');
      }
      return envio;
    }
    throw new ForbiddenException('Acesso negado a este envio');
  }

  async createModelo(dto: CreateModeloFormularioDto, user: JwtPayloadUser) {
    if (!this.podeGerirModelos(user)) {
      throw new ForbiddenException('Sem permissão para criar modelos de formulário');
    }
    const wid = requireWorkspaceId(user);
    return this.prisma.modeloFormulario.create({
      data: {
        workspaceId: wid,
        titulo: dto.titulo ?? null,
        frequenciaDias: dto.frequenciaDias ?? null,
      },
    });
  }

  async findAllModelos(user: JwtPayloadUser) {
    if (isAdminSistema(user)) {
      return this.prisma.modeloFormulario.findMany({
        include: { perguntas: true, _count: { select: { enviosFormulario: true } } },
        orderBy: { id: 'desc' },
      });
    }
    if (this.podeGerirModelos(user)) {
      const wid = requireWorkspaceId(user);
      return this.prisma.modeloFormulario.findMany({
        where: { workspaceId: wid },
        include: { perguntas: true, _count: { select: { enviosFormulario: true } } },
        orderBy: { id: 'desc' },
      });
    }
    return [];
  }

  async findOneModelo(id: number, user: JwtPayloadUser) {
    if (user.perfil === PerfilUsuario.paciente) {
      throw new ForbiddenException('Acesso negado');
    }
    if (this.podeGerirModelos(user)) await this.ensureModeloNoTenant(id, user);
    const modelo = await this.prisma.modeloFormulario.findUnique({
      where: { id },
      include: { perguntas: { orderBy: { id: 'asc' } } },
    });
    if (!modelo) throw new NotFoundException('Modelo não encontrado');
    return modelo;
  }

  async updateModelo(id: number, dto: UpdateModeloFormularioDto, user: JwtPayloadUser) {
    await this.ensureModeloNoTenant(id, user);
    return this.prisma.modeloFormulario.update({
      where: { id },
      data: {
        titulo: dto.titulo,
        frequenciaDias: dto.frequenciaDias,
      },
    });
  }

  async removeModelo(id: number, user: JwtPayloadUser) {
    await this.ensureModeloNoTenant(id, user);
    await this.prisma.modeloFormulario.delete({ where: { id } });
    return { deleted: true };
  }

  async createPergunta(idModelo: number, dto: CreatePerguntaDto, user: JwtPayloadUser) {
    await this.ensureModeloNoTenant(idModelo, user);
    const opcoesJson =
      dto.opcoes != null && dto.opcoes.length > 0
        ? (dto.opcoes as Prisma.InputJsonValue)
        : undefined;
    return this.prisma.pergunta.create({
      data: {
        idModelo,
        textoPergunta: dto.textoPergunta ?? null,
        tipoResposta: dto.tipoResposta ?? null,
        tagAnalise: dto.tagAnalise ?? null,
        obrigatoria: dto.obrigatoria ?? false,
        ...(opcoesJson !== undefined ? { opcoesJson } : {}),
      },
    });
  }

  async updatePergunta(id: number, dto: UpdatePerguntaDto, user: JwtPayloadUser) {
    const pergunta = await this.prisma.pergunta.findUnique({ where: { id }, include: { modelo: true } });
    if (!pergunta) throw new NotFoundException('Pergunta não encontrada');
    await this.ensureModeloNoTenant(pergunta.idModelo, user);
    const data: Prisma.PerguntaUpdateInput = {
      textoPergunta: dto.textoPergunta,
      tipoResposta: dto.tipoResposta,
      tagAnalise: dto.tagAnalise,
    };
    if (dto.obrigatoria !== undefined) {
      data.obrigatoria = dto.obrigatoria;
    }
    if (dto.opcoes !== undefined) {
      data.opcoesJson =
        dto.opcoes.length > 0 ? (dto.opcoes as Prisma.InputJsonValue) : Prisma.DbNull;
    }
    return this.prisma.pergunta.update({
      where: { id },
      data,
    });
  }

  async removePergunta(id: number, user: JwtPayloadUser) {
    const pergunta = await this.prisma.pergunta.findUnique({ where: { id }, include: { modelo: true } });
    if (!pergunta) throw new NotFoundException('Pergunta não encontrada');
    await this.ensureModeloNoTenant(pergunta.idModelo, user);
    await this.prisma.pergunta.delete({ where: { id } });
    return { deleted: true };
  }

  async createEnvio(dto: CreateEnvioDto, user: JwtPayloadUser) {
    await this.ensureProfissionalAcessoPaciente(dto.idPaciente, user);
    await this.ensureModeloNoTenant(dto.idModelo, user);
    return this.prisma.envioFormulario.create({
      data: {
        idPaciente: dto.idPaciente,
        idModelo: dto.idModelo,
        enviadoEm: new Date(),
        status: 'enviado',
      },
      include: { modelo: { include: { perguntas: true } }, paciente: true },
    });
  }

  async findEnvios(user: JwtPayloadUser, idPaciente?: number) {
    if (idPaciente != null) await this.ensureProfissionalAcessoPaciente(idPaciente, user);
    if (user.perfil === PerfilUsuario.paciente) {
      return this.prisma.envioFormulario.findMany({
        where: { idPaciente: user.sub },
        include: { modelo: { include: { perguntas: true } } },
        orderBy: { enviadoEm: 'desc' },
      });
    }
    if (this.podeGerirModelos(user)) {
      const wid = requireWorkspaceId(user);
      const basePaciente =
        user.perfil === PerfilUsuario.nutricionista
          ? { workspaceId: wid, idNutricionista: user.sub }
          : { workspaceId: wid };
      const where =
        idPaciente != null
          ? { idPaciente, paciente: basePaciente }
          : { paciente: basePaciente };
      return this.prisma.envioFormulario.findMany({
        where,
        include: { modelo: { include: { perguntas: true } }, paciente: true },
        orderBy: { enviadoEm: 'desc' },
      });
    }
    if (isAdminSistema(user)) {
      const where = idPaciente != null ? { idPaciente } : {};
      return this.prisma.envioFormulario.findMany({
        where,
        include: { modelo: { include: { perguntas: true } }, paciente: true },
        orderBy: { enviadoEm: 'desc' },
      });
    }
    return [];
  }

  async findOneEnvio(id: number, user: JwtPayloadUser) {
    return this.ensureEnvioAccess(id, user, true);
  }

  async submitRespostas(idEnvio: number, dto: SubmitRespostasDto, user: JwtPayloadUser) {
    const envio = await this.ensureEnvioAccess(idEnvio, user);
    if (envio.idPaciente !== user.sub && !isAdminSistema(user)) {
      throw new ForbiddenException('Apenas o paciente pode enviar as respostas');
    }
    await this.prisma.resposta.deleteMany({ where: { idEnvio } });
    if (dto.respostas.length > 0) {
      await this.prisma.resposta.createMany({
        data: dto.respostas.map((r) => ({
          idEnvio,
          idPergunta: r.idPergunta,
          valorResposta: r.valorResposta ?? null,
        })),
      });
    }
    await this.prisma.envioFormulario.update({
      where: { id: idEnvio },
      data: { respondidoEm: new Date(), status: 'respondido' },
    });
    return this.prisma.envioFormulario.findUnique({
      where: { id: idEnvio },
      include: { respostas: true, modelo: { include: { perguntas: true } } },
    });
  }

  async getStats(user: JwtPayloadUser) {
    if (!this.podeGerirModelos(user) && !isAdminSistema(user)) {
      return {
        formulariosAtivos: 0,
        respostasEstaSemana: 0,
        taxaResposta: 0,
        pacientesEngajados: 0,
      };
    }

    const inicioSemana = new Date();
    inicioSemana.setDate(inicioSemana.getDate() - 7);
    inicioSemana.setHours(0, 0, 0, 0);

    if (isAdminSistema(user)) {
      const [formulariosAtivos, respostasEstaSemana, enviosRespondidos, enviosTotal] =
        await Promise.all([
          this.prisma.modeloFormulario.count(),
          this.prisma.envioFormulario.count({
            where: { respondidoEm: { gte: inicioSemana } },
          }),
          this.prisma.envioFormulario.count({ where: { respondidoEm: { not: null } } }),
          this.prisma.envioFormulario.count(),
        ]);
      const taxaResposta =
        enviosTotal > 0 ? Math.round((enviosRespondidos / enviosTotal) * 100) : 0;
      return {
        formulariosAtivos,
        respostasEstaSemana,
        taxaResposta,
        pacientesEngajados: 0,
      };
    }

    const wid = requireWorkspaceId(user);
    const whereModelo = { workspaceId: wid };
    const whereEnvioPaciente =
      user.perfil === PerfilUsuario.nutricionista
        ? { workspaceId: wid, idNutricionista: user.sub }
        : { workspaceId: wid };

    const [formulariosAtivos, respostasEstaSemana, enviosRespondidos, enviosTotal, pacientesComResposta] =
      await Promise.all([
        this.prisma.modeloFormulario.count({ where: whereModelo }),
        this.prisma.envioFormulario.count({
          where: {
            paciente: whereEnvioPaciente,
            respondidoEm: { gte: inicioSemana },
          },
        }),
        this.prisma.envioFormulario.count({
          where: { paciente: whereEnvioPaciente, respondidoEm: { not: null } },
        }),
        this.prisma.envioFormulario.count({ where: { paciente: whereEnvioPaciente } }),
        user.perfil === PerfilUsuario.nutricionista
          ? this.prisma.envioFormulario
              .findMany({
                where: {
                  paciente: whereEnvioPaciente,
                  respondidoEm: { not: null },
                },
                distinct: ['idPaciente'],
                select: { idPaciente: true },
              })
              .then((r) => r.length)
          : Promise.resolve(0),
      ]);

    const taxaResposta =
      enviosTotal > 0 ? Math.round((enviosRespondidos / enviosTotal) * 100) : 0;

    return {
      formulariosAtivos,
      respostasEstaSemana,
      taxaResposta,
      pacientesEngajados: pacientesComResposta,
    };
  }

  async getRespostasFormatadasParaPaciente(idPaciente: number): Promise<string> {
    const envios = await this.prisma.envioFormulario.findMany({
      where: { idPaciente },
      include: {
        modelo: true,
        respostas: { include: { pergunta: true } },
      },
      orderBy: { enviadoEm: 'asc' },
    });
    const linhas: string[] = [];
    for (const envio of envios) {
      const dataEnv = envio.enviadoEm?.toISOString().slice(0, 10) ?? '?';
      const dataResp = envio.respondidoEm?.toISOString().slice(0, 10) ?? '?';
      linhas.push(`## Formulário: ${envio.modelo.titulo ?? 'Sem título'} (enviado em ${dataEnv}, respondido em ${dataResp})`);
      for (const r of envio.respostas) {
        linhas.push(`- ${r.pergunta.textoPergunta ?? 'Pergunta'}: ${r.valorResposta ?? '-'}`);
      }
      linhas.push('');
    }
    return linhas.join('\n') || 'Nenhuma resposta de formulário registrada para este paciente.';
  }
}
