import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PushService } from './push.service';

class RegistrarTokenDto {
  @IsString()
  @MinLength(8, { message: 'Token de push inv\u00e1lido.' })
  token!: string;

  @IsOptional()
  @IsString()
  plataforma?: string;
}

class RemoverTokenDto {
  @IsString()
  @MinLength(8, { message: 'Token de push inv\u00e1lido.' })
  token!: string;
}

/**
 * Registro do aparelho do paciente para receber push.
 *
 * A rota \u00e9 `/notifications/device-token` (em ingl\u00eas) porque \u00e9 EXATAMENTE o que
 * o app chama em `services/notifications.ts`. Antes ela n\u00e3o existia no NestJS e
 * o app engolia o 404 no catch: o token nunca era gravado, o push nunca sa\u00eda e
 * nenhum erro aparecia.
 */
@ApiTags('Notifica\u00e7\u00f5es')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class DispositivosPushController {
  constructor(private readonly push: PushService) {}

  @Post('device-token')
  @ApiResponse({ status: 201, description: 'Aparelho registrado para receber avisos' })
  registrar(@Body() dto: RegistrarTokenDto, @CurrentUser() user: JwtPayloadUser) {
    if (user.perfil !== 'paciente') {
      throw new ForbiddenException('Apenas o paciente registra aparelho para avisos.');
    }
    return this.push.registrar(user.sub, dto.token, dto.plataforma);
  }

  @Delete('device-token')
  @HttpCode(200)
  @ApiResponse({ status: 200, description: 'Aparelho removido' })
  remover(@Body() dto: RemoverTokenDto, @CurrentUser() user: JwtPayloadUser) {
    if (user.perfil !== 'paciente') {
      throw new ForbiddenException('Apenas o paciente remove aparelho.');
    }
    return this.push.remover(dto.token, user.sub);
  }
}
