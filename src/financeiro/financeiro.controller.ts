import {
  Body,
  Header,
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
import { FinanceiroService } from './financeiro.service';
import { CreateLancamentoFinanceiroDto } from './dto/create-lancamento-financeiro.dto';
import { UpdateLancamentoFinanceiroDto } from './dto/update-lancamento-financeiro.dto';
import { QueryLancamentosFinanceirosDto } from './dto/query-lancamentos-financeiros.dto';

@ApiTags('Financeiro')
@ApiBearerAuth('access-token')
@Controller('financeiro')
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Get('lancamentos')
  @ApiQuery({ name: 'mes', required: false, description: 'YYYY-MM' })
  @ApiQuery({ name: 'tipo', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'busca', required: false })
  @ApiResponse({ status: 200, description: 'Lançamentos do período (status já derivado)' })
  list(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: QueryLancamentosFinanceirosDto,
  ) {
    return this.financeiroService.list(user, query);
  }

  /**
   * CSV do período filtrado. Precisa vir antes de `lancamentos/:id` para não
   * ser capturada como id.
   */
  @Get('lancamentos/exportar')
  @ApiResponse({ status: 200, description: 'CSV do período filtrado' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="financeiro.csv"')
  exportar(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: QueryLancamentosFinanceirosDto,
  ) {
    return this.financeiroService.exportarCsv(user, query);
  }

  @Get('resumo')
  @ApiQuery({ name: 'mes', required: false, description: 'YYYY-MM' })
  @ApiResponse({ status: 200, description: 'Totais, próximos vencimentos e fluxo de 6 meses' })
  resumo(
    @CurrentUser() user: JwtPayloadUser,
    @Query('mes') mes?: string,
  ) {
    return this.financeiroService.resumo(user, mes);
  }

  @Post('gerar-mensalidades')
  @ApiQuery({ name: 'mes', required: false, description: 'YYYY-MM' })
  @ApiResponse({ status: 201, description: 'Mensalidades geradas para a competência' })
  gerarMensalidades(
    @CurrentUser() user: JwtPayloadUser,
    @Query('mes') mes?: string,
  ) {
    return this.financeiroService.gerarMensalidades(user, mes);
  }

  @Post('lancamentos')
  @ApiResponse({ status: 201, description: 'Lançamento criado' })
  create(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: CreateLancamentoFinanceiroDto,
  ) {
    return this.financeiroService.create(user, dto);
  }

  @Patch('lancamentos/:id')
  @ApiResponse({ status: 200, description: 'Lançamento atualizado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpdateLancamentoFinanceiroDto,
  ) {
    return this.financeiroService.update(id, user, dto);
  }

  @Patch('lancamentos/:id/marcar-pago')
  @ApiResponse({ status: 200, description: 'Lançamento marcado como pago' })
  markAsPaid(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.financeiroService.markAsPaid(id, user);
  }

  @Delete('lancamentos/:id')
  @ApiResponse({ status: 200, description: 'Lançamento removido' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.financeiroService.remove(id, user);
  }
}
