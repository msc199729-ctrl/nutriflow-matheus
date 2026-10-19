import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { StatusLancamentoFinanceiro, TipoLancamentoFinanceiro } from '@prisma/client';

export class CreateLancamentoFinanceiroDto {
  @ApiProperty({ description: 'Descrição do lançamento' })
  @IsString()
  @MaxLength(180)
  descricao!: string;

  @ApiPropertyOptional({ description: 'Nome do paciente (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pacienteNome?: string;

  @ApiPropertyOptional({ description: 'Categoria (consulta, aluguel, software...)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoria?: string;

  @ApiProperty({ enum: TipoLancamentoFinanceiro })
  @IsEnum(TipoLancamentoFinanceiro)
  tipo!: TipoLancamentoFinanceiro;

  @ApiProperty({ enum: StatusLancamentoFinanceiro, required: false, default: 'pendente' })
  @IsOptional()
  @IsEnum(StatusLancamentoFinanceiro)
  status?: StatusLancamentoFinanceiro;

  @ApiProperty({ description: 'Valor em reais' })
  @IsNumber()
  @Min(0.01)
  valor!: number;

  @ApiProperty({ description: 'Data de vencimento (YYYY-MM-DD)' })
  @IsDateString()
  vencimento!: string;

  @ApiPropertyOptional({ description: 'Data de pagamento (YYYY-MM-DD), quando pago' })
  @IsOptional()
  @IsDateString()
  pagoEm?: string;

  @ApiPropertyOptional({ description: 'Observações internas' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}
