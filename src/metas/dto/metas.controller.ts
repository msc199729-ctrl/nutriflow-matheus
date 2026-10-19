import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { MetasService } from './metas.service';
import { CreateMetaDto } from './dto/create-meta.dto';

@ApiTags('Metas')
@ApiBearerAuth('access-token')
@Controller('pacientes/:idPaciente/metas')
export class MetasController {
  constructor(private readonly metasService: MetasService) {}

  @Post()
  create(
    @Body() dto: CreateMetaDto,
    @CurrentUser() user: JwtPayloadUser,
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
  ) {
    return this.metasService.create(dto, user, idPaciente);
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtPayloadUser,
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
  ) {
    return this.metasService.findAll(user, idPaciente);
  }

  @Patch(':id/concluir')
  toggle(
    @CurrentUser() user: JwtPayloadUser,
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.metasService.toggle(user, idPaciente, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: JwtPayloadUser,
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.metasService.remove(user, idPaciente, id);
  }
}