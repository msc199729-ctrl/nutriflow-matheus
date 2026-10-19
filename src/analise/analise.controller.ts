import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AnaliseService } from './analise.service';

@ApiTags('Análise')
@ApiBearerAuth('access-token')
@Controller('pacientes/:idPaciente/analise')
export class AnaliseController {
  constructor(private readonly analiseService: AnaliseService) {}

  @Get('evolucao')
  evolucao(
    @CurrentUser() user: JwtPayloadUser,
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
  ) {
    return this.analiseService.evolucao(user, idPaciente);
  }
}