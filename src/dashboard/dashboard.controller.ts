import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiResponse({ status: 200, description: 'Estatísticas do painel' })
  getStats(@CurrentUser() user: JwtPayloadUser) {
    return this.dashboardService.getStats(user);
  }

  @Get('alertas')
  @ApiResponse({ status: 200, description: 'Lista de alertas de pacientes' })
  getAlertas(@CurrentUser() user: JwtPayloadUser) {
    return this.dashboardService.getAlertas(user);
  }

  @Get('agenda')
  @ApiResponse({ status: 200, description: 'Agenda do dia (vazio se não houver módulo de agenda)' })
  getAgenda(@CurrentUser() user: JwtPayloadUser) {
    return this.dashboardService.getAgenda(user);
  }
}
