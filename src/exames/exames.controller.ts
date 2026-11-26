import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { ExamesService } from './exames.service';
import { CreateExameDto, UpdateExameDto } from './dto/exame.dto';

@ApiTags('Exames Laboratoriais')
@ApiBearerAuth('access-token')
@Controller('pacientes/:idPaciente/exames')
export class ExamesController {
  constructor(private readonly examesService: ExamesService) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Coleta criada com os itens' })
  create(
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
    @Body() dto: CreateExameDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.examesService.create(idPaciente, dto, user);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Coletas do paciente, mais recente primeiro' })
  findAll(
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.examesService.findAll(idPaciente, user);
  }

  /**
   * Comparativo do mesmo biomarcador entre coletas.
   * Precisa vir antes de `:id`, senão "comparativo" vira um id.
   */
  @Get('comparativo')
  @ApiQuery({
    name: 'nomes',
    required: false,
    description: 'Lista separada por vírgula; sem ela, compara todos',
  })
  @ApiResponse({ status: 200, description: 'Série de cada biomarcador entre coletas' })
  comparativo(
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
    @CurrentUser() user: JwtPayloadUser,
    @Query('nomes') nomes?: string,
  ) {
    const lista = nomes
      ?.split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    return this.examesService.comparativo(idPaciente, user, lista);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.examesService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExameDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.examesService.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.examesService.remove(id, user);
  }
}
