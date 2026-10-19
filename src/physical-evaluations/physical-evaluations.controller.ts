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
import { PhysicalEvaluationsService } from './physical-evaluations.service';
import { CreateAvaliacaoFisicaDto } from './dto/create-avaliacao-fisica.dto';
import { UpdateAvaliacaoFisicaDto } from './dto/update-avaliacao-fisica.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('Avaliações Físicas')
@ApiBearerAuth('access-token')
@Controller('avaliacoes-fisicas')
export class PhysicalEvaluationsController {
  constructor(
    private readonly physicalEvaluationsService: PhysicalEvaluationsService,
  ) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Avaliação criada (IMC/RCQ calculados automaticamente)' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 403, description: 'Paciente não vinculado ao nutricionista' })
  create(
    @Body() dto: CreateAvaliacaoFisicaDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.physicalEvaluationsService.create(dto, user);
  }

  @Get()
  @ApiQuery({ name: 'idPaciente', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de avaliações' })
  findAll(
    @Query('idPaciente') idPaciente: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const id = idPaciente ? parseInt(idPaciente, 10) : undefined;
    return this.physicalEvaluationsService.findAll(
      Number.isNaN(id) ? undefined : id,
      user,
    );
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Avaliação encontrada' })
  @ApiResponse({ status: 404, description: 'Avaliação não encontrada' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.physicalEvaluationsService.findOne(id, user);
  }

  @Put(':id')
  @ApiResponse({ status: 200, description: 'Avaliação atualizada' })
  @ApiResponse({ status: 404, description: 'Avaliação não encontrada' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAvaliacaoFisicaDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.physicalEvaluationsService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Avaliação removida' })
  @ApiResponse({ status: 404, description: 'Avaliação não encontrada' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.physicalEvaluationsService.remove(id, user);
  }
}
