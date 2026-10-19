import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  isNutricionistaInadimplenteSaas,
  MSG_SAAS_INADIMPLENTE,
} from '../common/saas-billing.util';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import {
  countAnalisesIaUsoMes,
  countPacientesPorPlano,
  normalizarPlanoSaas,
  SAAS_LIMITE_IA_ACOES_MES,
  SAAS_LIMITE_PACIENTES,
} from '../common/saas-plans.util';
import { JwtService } from '@nestjs/jwt';
import { PerfilUsuario, TipoConselho } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioComPerfil } from '../users/users.service';
import { UsersService } from '../users/users.service';
import { MSG_NUTRICIONISTA_ATIVO_SEM_WORKSPACE } from './auth.constants';
import { RegisterPublicDto } from './dto/register-public.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async register(dto: RegisterPublicDto) {
    const senhaHash = await this.usersService.hashPassword(dto.senha);
    const nomeClinica =
      dto.nomeClinicaCadastro?.trim() ? dto.nomeClinicaCadastro.trim() : null;
    const cnpjClinica =
      dto.cnpjClinicaCadastro?.trim() ? dto.cnpjClinicaCadastro.trim() : null;

    await this.usersService.createUsuario({
      email: dto.email,
      senhaHash,
      perfil: PerfilUsuario.nutricionista,
      workspaceId: null,
      nome: dto.nome,
      crn: dto.crn,
      tipoConselho:
        dto.tipoConselho === 'crm' ? TipoConselho.crm : TipoConselho.crn,
      contaAtiva: false,
      planoSaas: dto.planoSaas,
      diaVencimentoSaas: dto.diaVencimentoSaas,
      proximoVencimentoSaas: null,
      nomeClinicaCadastro: nomeClinica,
      cnpjClinicaCadastro: cnpjClinica,
    });

    return {
      message:
        'Cadastro recebido. Sua conta ficará inativa até o super administrador aprovar. Você receberá acesso ao fazer login após a aprovação.',
      pendenteAprovacao: true,
    };
  }

  async login(email: string, senha: string) {
    const emailNorm = email.trim().toLowerCase();
    const found = await this.usersService.findByEmail(emailNorm);
    if (found && !found.bloqueado) {
      const valid = await this.usersService.validatePassword(senha, found.senhaHash);
      if (
        valid &&
        found.perfil === PerfilUsuario.nutricionista &&
        !found.contaAtiva
      ) {
        throw new UnauthorizedException(
          'Sua conta ainda aguarda aprovação do super administrador do sistema.',
        );
      }
    }

    const user = await this.validateUser(email, senha);
    if (!user) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }
    return this.buildToken(user);
  }

  async validateUser(
    email: string,
    senha: string,
  ): Promise<UsuarioComPerfil | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    if (user.bloqueado) return null;
    if (user.perfil === PerfilUsuario.nutricionista && !user.contaAtiva) {
      return null;
    }
    const valid = await this.usersService.validatePassword(senha, user.senhaHash);
    if (!valid) return null;
    if (
      user.perfil === PerfilUsuario.nutricionista &&
      user.contaAtiva &&
      user.workspaceId == null
    ) {
      throw new UnauthorizedException(MSG_NUTRICIONISTA_ATIVO_SEM_WORKSPACE);
    }
    if (isNutricionistaInadimplenteSaas(user)) {
      throw new UnauthorizedException(MSG_SAAS_INADIMPLENTE);
    }
    return user;
  }

  private buildToken(user: UsuarioComPerfil) {
    const payload = {
      sub: user.id,
      email: user.email,
      perfil: user.perfil,
      workspaceId: user.workspaceId,
    };
    const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const access_token = this.jwtService.sign(payload, { expiresIn } as any);
    const decoded = this.jwtService.decode(access_token) as { exp: number; iat: number };
    const expires_in = decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : 604800; // 7d em segundos
    return {
      access_token,
      token_type: 'Bearer',
      expires_in,
    };
  }

  /** Dados para GET /auth/me (JWT + cotas do plano para nutricionista). */
  async getMePayload(user: JwtPayloadUser) {
    const planoNut =
      user.perfil === PerfilUsuario.nutricionista
        ? normalizarPlanoSaas(user.planoSaas)
        : null;

    const base: Record<string, unknown> = {
      sub: user.sub,
      email: user.email,
      perfil: user.perfil,
      workspaceId: user.workspaceId,
    };
    if (user.idNutricionista !== undefined) {
      base.idNutricionista = user.idNutricionista;
    }
    if (planoNut !== null) {
      base.planoSaas = planoNut;
    }

    if (user.perfil !== PerfilUsuario.nutricionista || user.workspaceId == null) {
      return base;
    }

    const plano = planoNut!;
    const wid = user.workspaceId;

    const pacientesTotal = await countPacientesPorPlano(this.prisma, {
      workspaceId: wid,
      plano,
      idNutricionista: user.sub,
    });

    const iaUsadasMes = await countAnalisesIaUsoMes(this.prisma, {
      workspaceId: wid,
      plano,
      idNutricionista: user.sub,
    });

    return {
      ...base,
      pacientesTotal,
      pacientesLimite: SAAS_LIMITE_PACIENTES[plano],
      iaUsadasMes,
      iaLimiteMes: SAAS_LIMITE_IA_ACOES_MES[plano],
    };
  }
}
