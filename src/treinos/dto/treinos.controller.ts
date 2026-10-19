import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { TreinosService } from './treinos.service';
import { CreateTreinoDto } from './dto/create-treino.dto';

@ApiTags('Treinos')
@ApiBearerAuth('access-token')
@Controller('pacientes/:idPaciente/treinos')
export class TreinosController {
  constructor(private readonly treinosService: TreinosService) {}

  @Post()
  create(
    @Body() dto: CreateTreinoDto,
    @CurrentUser() user: JwtPayloadUser,
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
  ) {
    return this.treinosService.create(dto, user, idPaciente);
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtPayloadUser,
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
  ) {
    return this.treinosService.findAll(user, idPaciente);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: JwtPayloadUser,
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.treinosService.remove(user, idPaciente, id);
  }
}