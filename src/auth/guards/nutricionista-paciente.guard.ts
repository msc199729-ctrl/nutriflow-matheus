import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayloadUser } from '../../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../../common/tenant/tenant-scope';

export const PACIENTE_ID_PARAM_KEY = 'nutricionistaPacienteParam';

/**
 * Nutricionista só acessa pacientes do mesmo workspace e vinculados a ele.
 * Admin clínica e admin sistema não são restringidos por este guard.
 */
@Injectable()
export class NutricionistaPacienteGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: JwtPayloadUser;
      params?: Record<string, string>;
      query?: Record<string, string>;
    }>();
    const user = request.user;
    if (!user || user.perfil !== PerfilUsuario.nutricionista) {
      return true;
    }
    const paramName =
      this.reflector.get<string>(PACIENTE_ID_PARAM_KEY, context.getHandler()) ??
      'idPaciente';
    const idPaciente =
      request.params?.[paramName] ?? request.query?.[paramName];
    if (!idPaciente) {
      return true;
    }
    const pacienteId = parseInt(idPaciente, 10);
    if (Number.isNaN(pacienteId)) {
      throw new ForbiddenException('ID do paciente inválido');
    }
    const wid = requireWorkspaceId(user);
    const paciente = await this.prisma.paciente.findFirst({
      where: { id: pacienteId, idNutricionista: user.sub, workspaceId: wid },
    });
    if (!paciente) {
      throw new ForbiddenException(
        'Acesso negado: paciente não vinculado a este nutricionista',
      );
    }
    return true;
  }
}
