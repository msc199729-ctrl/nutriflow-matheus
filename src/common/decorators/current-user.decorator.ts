import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayloadUser {
  sub: number;
  email: string;
  perfil: string;
  /** Tenant lógico; null para admin_sistema. */
  workspaceId: number | null;
  idNutricionista?: number;
  /** Plano SaaS do nutricionista (`basico` \| `profissional` \| `clinica`); preenchido no JWT após validação. */
  planoSaas?: string | null;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayloadUser | undefined, ctx: ExecutionContext): JwtPayloadUser | unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayloadUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
