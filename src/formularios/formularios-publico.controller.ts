import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FormulariosPublicoService } from './formularios-publico.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

class RespostaPublicaItemDto {
  @ApiProperty({ description: 'ID da pergunta' })
  @IsInt()
  @Min(1)
  idPergunta: number;

  @ApiPropertyOptional({ description: 'Resposta do paciente' })
  @IsOptional()
  @IsString()
  valorResposta?: string;
}

class SubmitRespostasPublicoDto {
  @ApiProperty({ type: [RespostaPublicaItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RespostaPublicaItemDto)
  respostas: RespostaPublicaItemDto[];
}

/**
 * Rotas do formulário respondido pelo paciente SEM login.
 * `link/:idEnvio` continua autenticada (é o nutricionista que gera o link);
 * as demais são `@Public()` e o acesso é provado pelo token assinado na URL.
 */
@ApiTags('Formulários públicos')
@Controller('formularios/publico')
export class FormulariosPublicoController {
  constructor(private readonly service: FormulariosPublicoService) {}

  @Get('link/:idEnvio')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Gera o link público de um envio (nutricionista)' })
  @ApiQuery({ name: 'dias', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Token e data de expiração' })
  gerarLink(
    @Param('idEnvio', ParseIntPipe) idEnvio: number,
    @Query('dias') dias?: string,
    @CurrentUser() user?: JwtPayloadUser,
  ) {
    const n = dias != null ? Number.parseInt(dias, 10) : NaN;
    const validade = Number.isFinite(n) && n > 0 && n <= 365 ? n : undefined;
    return this.service.gerarLink(idEnvio, validade, user);
  }

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Formulário para o paciente responder (sem login)' })
  @ApiResponse({ status: 200, description: 'Modelo com perguntas e respostas dadas' })
  @ApiResponse({ status: 410, description: 'Link expirado' })
  getPublico(@Param('token') token: string) {
    return this.service.getPublico(token);
  }

  @Public()
  @Post(':token/respostas')
  @ApiOperation({ summary: 'Paciente envia as respostas pelo link (sem login)' })
  @ApiResponse({ status: 201, description: 'Respostas gravadas' })
  submitPublico(
    @Param('token') token: string,
    @Body() dto: SubmitRespostasPublicoDto,
  ) {
    return this.service.submitPublico(token, dto.respostas ?? []);
  }
}
