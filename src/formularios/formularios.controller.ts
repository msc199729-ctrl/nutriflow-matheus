import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FormulariosService } from './formularios.service';
import { CreateModeloFormularioDto } from './dto/create-modelo-formulario.dto';
import { UpdateModeloFormularioDto } from './dto/update-modelo-formulario.dto';
import { CreatePerguntaDto } from './dto/create-pergunta.dto';
import { UpdatePerguntaDto } from './dto/update-pergunta.dto';
import { CreateEnvioDto } from './dto/create-envio.dto';
import { SubmitRespostasDto } from './dto/submit-respostas.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('Formulários')
@ApiBearerAuth('access-token')
@Controller('formularios')
export class FormulariosController {
  constructor(private readonly formulariosService: FormulariosService) {}

  @Post('modelos')
  @ApiResponse({ status: 201, description: 'Modelo criado' })
  @ApiResponse({ status: 403, description: 'Apenas nutricionista' })
  createModelo(
    @Body() dto: CreateModeloFormularioDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.createModelo(dto, user);
  }

  @Get('stats')
  @ApiResponse({ status: 200, description: 'Estatísticas de formulários/check-ins' })
  getStats(@CurrentUser() user: JwtPayloadUser) {
    return this.formulariosService.getStats(user);
  }

  @Get('modelos')
  @ApiResponse({ status: 200, description: 'Lista de modelos' })
  findAllModelos(@CurrentUser() user: JwtPayloadUser) {
    return this.formulariosService.findAllModelos(user);
  }

  @Get('modelos/:id')
  @ApiResponse({ status: 200, description: 'Modelo com perguntas' })
  @ApiResponse({ status: 404, description: 'Modelo não encontrado' })
  findOneModelo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.findOneModelo(id, user);
  }

  @Put('modelos/:id')
  @ApiResponse({ status: 200, description: 'Modelo atualizado' })
  updateModelo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateModeloFormularioDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.updateModelo(id, dto, user);
  }

  @Delete('modelos/:id')
  @ApiResponse({ status: 200, description: 'Modelo removido' })
  removeModelo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.removeModelo(id, user);
  }

  @Post('modelos/:id/perguntas')
  @ApiResponse({ status: 201, description: 'Pergunta criada' })
  createPergunta(
    @Param('id', ParseIntPipe) idModelo: number,
    @Body() dto: CreatePerguntaDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.createPergunta(idModelo, dto, user);
  }

  @Put('perguntas/:id')
  @ApiResponse({ status: 200, description: 'Pergunta atualizada' })
  updatePergunta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePerguntaDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.updatePergunta(id, dto, user);
  }

  @Delete('perguntas/:id')
  @ApiResponse({ status: 200, description: 'Pergunta removida' })
  removePergunta(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.removePergunta(id, user);
  }

  @Post('envios')
  @ApiResponse({ status: 201, description: 'Formulário enviado ao paciente' })
  createEnvio(
    @Body() dto: CreateEnvioDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.createEnvio(dto, user);
  }

  @Get('envios')
  @ApiQuery({ name: 'idPaciente', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de envios' })
  findEnvios(
    @Query('idPaciente') idPaciente: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const id = idPaciente ? parseInt(idPaciente, 10) : undefined;
    return this.formulariosService.findEnvios(
      user,
      id != null && !Number.isNaN(id) ? id : undefined,
    );
  }

  @Get('envios/:id')
  @ApiResponse({ status: 200, description: 'Envio com modelo e respostas' })
  findOneEnvio(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.findOneEnvio(id, user);
  }

  @Post('envios/:id/respostas')
  @ApiResponse({ status: 200, description: 'Respostas enviadas' })
  submitRespostas(
    @Param('id', ParseIntPipe) idEnvio: number,
    @Body() dto: SubmitRespostasDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.formulariosService.submitRespostas(idEnvio, dto, user);
  }
}
