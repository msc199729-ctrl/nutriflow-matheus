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
  @ApiResponse({ status: 200, description: 'Lista de lançamentos financeiros' })
  list(
    @Query() query: QueryLancamentosFinanceirosDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.financeiroService.list(user, query);
  }

  @Get('resumo')
  @ApiQuery({ name: 'mes', required: false, description: 'Mês no formato YYYY-MM' })
  @ApiResponse({ status: 200, description: 'Resumo financeiro mensal' })
  resumo(
    @Query('mes') mes: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.financeiroService.resumo(user, mes);
  }

  @Post('gerar-mensalidades')
  @ApiQuery({ name: 'mes', required: false, description: 'Competência YYYY-MM' })
  @ApiResponse({ status: 200, description: 'Geração idempotente de mensalidades' })
  gerarMensalidades(
    @Query('mes') mes: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.financeiroService.gerarMensalidades(user, mes);
  }

  @Post('lancamentos')
  @ApiResponse({ status: 201, description: 'Lançamento criado' })
  create(
    @Body() dto: CreateLancamentoFinanceiroDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.financeiroService.create(user, dto);
  }

  @Patch('lancamentos/:id')
  @ApiResponse({ status: 200, description: 'Lançamento atualizado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLancamentoFinanceiroDto,
    @CurrentUser() user: JwtPayloadUser,
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
