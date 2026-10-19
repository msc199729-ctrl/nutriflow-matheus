import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusLancamentoFinanceiro, TipoLancamentoFinanceiro } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class QueryLancamentosFinanceirosDto {
  @ApiPropertyOptional({ description: 'Mês no formato YYYY-MM' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'mes deve estar no formato YYYY-MM' })
  mes?: string;

  @ApiPropertyOptional({ enum: TipoLancamentoFinanceiro })
  @IsOptional()
  @IsEnum(TipoLancamentoFinanceiro)
  tipo?: TipoLancamentoFinanceiro;

  @ApiPropertyOptional({ enum: StatusLancamentoFinanceiro })
  @IsOptional()
  @IsEnum(StatusLancamentoFinanceiro)
  status?: StatusLancamentoFinanceiro;

  @ApiPropertyOptional({ description: 'Busca por descrição/paciente/categoria' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;
}
