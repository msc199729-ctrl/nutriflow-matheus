import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PerfilUsuario } from '@prisma/client';
import { JwtPayloadUser } from '../../common/decorators/current-user.decorator';
import {
  isNutricionistaInadimplenteSaas,
  MSG_SAAS_INADIMPLENTE,
} from '../../common/saas-billing.util';
import { MSG_NUTRICIONISTA_ATIVO_SEM_WORKSPACE } from '../auth.constants';
import { UsersService, UsuarioComPerfil } from '../../users/users.service';

export interface JwtPayload {
  sub: number;
  email: string;
  perfil: string;
  workspaceId: number | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'default-secret-change-me',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayloadUser> {
    const user: UsuarioComPerfil | null = await this.usersService.findById(
      payload.sub,
    );
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    if (user.bloqueado) {
      throw new UnauthorizedException('Conta bloqueada');
    }
    if (user.perfil === PerfilUsuario.nutricionista && !user.contaAtiva) {
      throw new UnauthorizedException('Conta aguardando aprovação');
    }
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
    const result: JwtPayloadUser = {
      sub: user.id,
      email: user.email,
      perfil: user.perfil,
      workspaceId: user.workspaceId,
    };
    if (user.perfil === PerfilUsuario.paciente && user.paciente) {
      result.idNutricionista = user.paciente.idNutricionista;
    } else if (user.perfil === PerfilUsuario.nutricionista) {
      result.idNutricionista = user.id;
      result.planoSaas = user.nutricionista?.planoSaas ?? null;
    }
    return result;
  }
}
