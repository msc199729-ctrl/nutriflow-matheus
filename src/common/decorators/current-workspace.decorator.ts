import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayloadUser } from './current-user.decorator';

/**
 * Retorna o `workspaceId` do JWT (`req.user`), quando existir.
 * `admin_sistema` costuma ter `workspaceId` null.
 */
export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number | null => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayloadUser }>();
    return request.user?.workspaceId ?? null;
  },
);
