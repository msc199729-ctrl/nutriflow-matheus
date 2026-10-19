import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RelatoriosService } from './relatorios.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { GerarImpressoDto } from './dto/gerar-impresso.dto';

@ApiTags('Relatórios')
@ApiBearerAuth('access-token')
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('resumo')
  @ApiQuery({ name: 'mes', required: true, example: '2026-03', description: 'Ano-mês (YYYY-MM)' })
  @ApiResponse({ status: 200, description: 'Resumo mensal para o painel' })
  getResumo(
    @Query('mes') mes: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const mesAno = mes || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    return this.relatoriosService.getResumo(user, mesAno);
  }

  @Get('resumo/pdf')
  @ApiQuery({ name: 'mes', required: true, example: '2026-03', description: 'Ano-mês (YYYY-MM)' })
  @ApiResponse({ status: 200, description: 'PDF com resumo do período' })
  async exportResumoPdf(
    @Query('mes') mes: string,
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
  ) {
    const mesAno = mes || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const buffer = await this.relatoriosService.buildResumoPdf(user, mesAno);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="relatorio-${mesAno}.pdf"`,
    );
    res.send(buffer);
  }

  @Post('impressos/pdf')
  @ApiResponse({ status: 200, description: 'PDF do impresso gerado com sucesso' })
  async gerarImpressoPdf(
    @Body() dto: GerarImpressoDto,
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
  ) {
    const generated = await this.relatoriosService.buildImpressoPdf(user, dto);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${generated.filename}.pdf"`,
    );
    res.send(generated.buffer);
  }
}
