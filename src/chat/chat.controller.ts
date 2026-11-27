import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';

class AbrirConversaDto {
  @IsOptional()
  @IsInt()
  idPaciente?: number;
}

class EnviarMensagemDto {
  @IsString()
  @MinLength(1, { message: 'Escreva uma mensagem.' })
  @MaxLength(4000, { message: 'Mensagem muito longa (máximo 4000 caracteres).' })
  texto!: string;
}

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversas')
  @ApiResponse({ status: 200, description: 'Conversas de quem está logado, mais recentes primeiro' })
  listar(@CurrentUser() user: JwtPayloadUser) {
    return this.chat.listar(user);
  }

  @Post('conversas')
  @ApiResponse({ status: 201, description: 'Conversa com o paciente (cria se não existir)' })
  abrir(@Body() dto: AbrirConversaDto, @CurrentUser() user: JwtPayloadUser) {
    return this.chat.abrir(user, dto);
  }

  /** O paciente não escolhe com quem fala: é sempre o nutricionista dele. */
  @Post('conversas/me')
  @ApiResponse({ status: 201, description: 'Conversa do paciente logado com o próprio nutricionista' })
  abrirMinha(@CurrentUser() user: JwtPayloadUser) {
    return this.chat.abrir(user, {});
  }

  @Get('conversas/:id/mensagens')
  @ApiQuery({ name: 'cursor', required: false, type: Number, description: 'Id da mensagem mais antiga já carregada' })
  @ApiResponse({ status: 200, description: 'Mensagens, mais novas primeiro (a tela inverte)' })
  mensagens(
    @Param('id', ParseIntPipe) id: number,
    @Query('cursor') cursor: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const c = cursor ? Number.parseInt(cursor, 10) : undefined;
    return this.chat.mensagens(id, user, Number.isFinite(c) ? c : undefined);
  }

  @Post('conversas/:id/mensagens')
  @ApiResponse({ status: 201, description: 'Mensagem enviada' })
  enviar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnviarMensagemDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.chat.enviar(id, dto.texto, user);
  }

  @Patch('conversas/:id/lida')
  @ApiResponse({ status: 200, description: 'Mensagens do outro lado marcadas como lidas' })
  marcarLida(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayloadUser) {
    return this.chat.marcarLida(id, user);
  }
}
