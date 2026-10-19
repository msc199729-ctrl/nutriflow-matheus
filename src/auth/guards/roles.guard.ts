import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PerfilUsuario } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtPayloadUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<PerfilUsuario[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user?: JwtPayloadUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Acesso negado');
    }
    const hasRole = requiredRoles.includes(user.perfil as PerfilUsuario);
    if (!hasRole) {
      throw new ForbiddenException('Permissão insuficiente para esta ação');
    }
    return true;
  }
}
