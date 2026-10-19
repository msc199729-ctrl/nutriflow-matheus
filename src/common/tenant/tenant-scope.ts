import { ForbiddenException } from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import type { JwtPayloadUser } from '../decorators/current-user.decorator';

export function isAdminSistema(user: JwtPayloadUser): boolean {
  return user.perfil === PerfilUsuario.admin_sistema;
}

/** Workspace obrigatório para qualquer perfil exceto admin_sistema. */
export function requireWorkspaceId(user: JwtPayloadUser): number {
  if (isAdminSistema(user)) {
    throw new ForbiddenException('Operação restrita a usuários do workspace');
  }
  if (user.workspaceId == null) {
    throw new ForbiddenException('Workspace não definido para este usuário');
  }
  return user.workspaceId;
}

/** Escopo Prisma: pacientes do tenant (sem filtro de nutricionista). */
export function wherePacientesNoWorkspace(user: JwtPayloadUser): { workspaceId: number } | Record<string, never> {
  if (isAdminSistema(user)) {
    return {};
  }
  return { workspaceId: requireWorkspaceId(user) };
}

/** Nutricionista: apenas pacientes vinculados a ele; admin_clinica: todo o tenant. */
export function wherePacientesParaProfissional(user: JwtPayloadUser): {
  workspaceId: number;
  idNutricionista?: number;
} {
  const workspaceId = requireWorkspaceId(user);
  if (user.perfil === PerfilUsuario.nutricionista) {
    return { workspaceId, idNutricionista: user.sub };
  }
  if (user.perfil === PerfilUsuario.admin_clinica) {
    return { workspaceId };
  }
  throw new ForbiddenException('Acesso negado');
}
