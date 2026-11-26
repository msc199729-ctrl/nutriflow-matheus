import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardService, type Periodo } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

const PERIODOS: Periodo[] = ['mes', '30d', 'ano'];

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiQuery({
    name: 'periodo',
    required: false,
    enum: PERIODOS,
    description: 'Recorte dos indicadores. Padrão: 30d.',
  })
  @ApiResponse({ status: 200, description: 'Estatísticas do painel' })
  getStats(
    @CurrentUser() user: JwtPayloadUser,
    @Query('periodo') periodo?: string,
  ) {
    // Query sem DTO de propósito: um valor estranho cai no padrão em vez de
    // derrubar o dashboard com 400.
    const p = PERIODOS.includes(periodo as Periodo)
      ? (periodo as Periodo)
      : '30d';
    return this.dashboardService.getStats(user, p);
  }

  @Get('alertas')
  @ApiResponse({
    status: 200,
    description: 'Fila de contato: pacientes ordenados por tempo sem contato',
  })
  getAlertas(@CurrentUser() user: JwtPayloadUser) {
    return this.dashboardService.getAlertas(user);
  }

  @Get('agenda')
  @ApiResponse({
    status: 200,
    description: 'Agenda do dia (vazio se não houver consulta marcada)',
  })
  getAgenda(@CurrentUser() user: JwtPayloadUser) {
    return this.dashboardService.getAgenda(user);
  }
}
