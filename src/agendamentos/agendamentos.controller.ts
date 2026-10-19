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
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AgendamentosService } from './agendamentos.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { QueryAgendamentosDto } from './dto/query-agendamentos.dto';

@ApiTags('Agendamentos')
@ApiBearerAuth('access-token')
@Controller('agendamentos')
export class AgendamentosController {
  constructor(private readonly agendamentosService: AgendamentosService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description:
      'Lista de consultas agendadas (nutricionista/admin: escopo profissional; paciente: apenas as próprias)',
  })
  findAll(
    @Query() query: QueryAgendamentosDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.agendamentosService.findAll(user, query);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Detalhe do agendamento' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.agendamentosService.findOne(id, user);
  }

  @Post()
  @ApiResponse({ status: 201, description: 'Consulta agendada' })
  create(
    @Body() dto: CreateAgendamentoDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.agendamentosService.create(dto, user);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Agendamento atualizado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAgendamentoDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.agendamentosService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Agendamento removido' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.agendamentosService.remove(id, user);
  }
}
