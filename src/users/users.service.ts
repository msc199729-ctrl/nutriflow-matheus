import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PerfilUsuario, Prisma, TipoConselho } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type UsuarioComPerfil = Prisma.UsuarioGetPayload<{
  include: { nutricionista: true; paciente: true };
}>;

@Injectable()
export class UsersService {
  private readonly saltRounds = 12;

  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UsuarioComPerfil | null> {
    return this.prisma.usuario.findUnique({
      where: { email: email.toLowerCase() },
      include: { nutricionista: true, paciente: true },
    });
  }

  async findById(id: number): Promise<UsuarioComPerfil | null> {
    return this.prisma.usuario.findUnique({
      where: { id },
      include: { nutricionista: true, paciente: true },
    });
  }

  /** Workspace do nutricionista (ex.: cadastro de paciente por convite). */
  async resolveWorkspaceIdFromNutricionista(idNutricionista: number): Promise<number> {
    const nut = await this.prisma.nutricionista.findUnique({
      where: { id: idNutricionista },
      include: { usuario: { select: { workspaceId: true } } },
    });
    const wid = nut?.usuario?.workspaceId;
    if (wid == null) {
      throw new ConflictException('Nutricionista sem workspace válido');
    }
    return wid;
  }

  async hashPassword(senha: string): Promise<string> {
    return bcrypt.hash(senha, this.saltRounds);
  }

  async validatePassword(senha: string, hash: string): Promise<boolean> {
    return bcrypt.compare(senha, hash);
  }

  async createUsuario(data: {
    email: string;
    senhaHash: string;
    perfil: PerfilUsuario;
    workspaceId: number | null;
    nome?: string;
    crn?: string;
    tipoConselho?: TipoConselho;
    idNutricionista?: number;
    /** Padrão true; cadastro público de nutricionista usa false até aprovação. */
    contaAtiva?: boolean;
    /** Plano SaaS (nutricionista). `proximoVencimentoSaas` costuma ser definido na aprovação ou na criação pelo admin. */
    planoSaas?: string | null;
    diaVencimentoSaas?: number | null;
    proximoVencimentoSaas?: Date | null;
    nomeClinicaCadastro?: string | null;
    cnpjClinicaCadastro?: string | null;
  }): Promise<UsuarioComPerfil> {
    const email = data.email.toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    let workspaceId = data.workspaceId;

    if (data.perfil === PerfilUsuario.paciente) {
      if (data.idNutricionista == null) {
        throw new ConflictException(
          'Paciente deve estar vinculado a um nutricionista (idNutricionista)',
        );
      }
      const fromNut = await this.resolveWorkspaceIdFromNutricionista(data.idNutricionista);
      if (workspaceId != null && workspaceId !== fromNut) {
        throw new ConflictException('Workspace incompatível com o nutricionista informado');
      }
      workspaceId = fromNut;
    }

    const contaAtiva = data.contaAtiva ?? true;
    const nutricionistaPendentePublico =
      data.perfil === PerfilUsuario.nutricionista && contaAtiva === false;

    if (
      data.perfil !== PerfilUsuario.admin_sistema &&
      workspaceId == null &&
      !nutricionistaPendentePublico
    ) {
      throw new ConflictException('Workspace obrigatório para este perfil');
    }

    const usuario = await this.prisma.usuario.create({
      data: {
        email,
        senhaHash: data.senhaHash,
        perfil: data.perfil,
        workspaceId:
          workspaceId === undefined || workspaceId === null
            ? null
            : workspaceId,
        contaAtiva,
      },
    });

    if (data.perfil === PerfilUsuario.nutricionista) {
      await this.prisma.nutricionista.create({
        data: {
          id: usuario.id,
          nome: data.nome ?? null,
          crn: data.crn ?? null,
          tipoConselho: data.tipoConselho ?? TipoConselho.crn,
          planoSaas: data.planoSaas ?? null,
          diaVencimentoSaas: data.diaVencimentoSaas ?? null,
          proximoVencimentoSaas: data.proximoVencimentoSaas ?? null,
          nomeClinicaCadastro: data.nomeClinicaCadastro ?? null,
          cnpjClinicaCadastro: data.cnpjClinicaCadastro ?? null,
        },
      });
    }

    if (data.perfil === PerfilUsuario.paciente) {
      await this.prisma.paciente.create({
        data: {
          id: usuario.id,
          workspaceId: workspaceId!,
          idNutricionista: data.idNutricionista!,
          nome: data.nome ?? null,
        },
      });
    }

    const created = await this.findById(usuario.id);
    if (!created) throw new Error('Usuário criado não encontrado');
    return created;
  }
}
