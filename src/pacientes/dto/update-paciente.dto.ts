import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateCobrancaMensalPacienteDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativa?: boolean;

  @ApiPropertyOptional({ description: 'Valor mensal em reais', example: 250 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  valorMensal?: number;

  @ApiPropertyOptional({ description: 'Dia de vencimento (1-28)', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimento?: number;

  @ApiPropertyOptional({ description: 'Início da cobrança (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  inicioCobranca?: string;

  @ApiPropertyOptional({ example: 'Mensalidade' })
  @IsOptional()
  @IsString()
  categoria?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class UpdatePacienteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional({ description: 'CPF do paciente (somente dígitos)', example: '12345678901' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'CPF deve conter exatamente 11 dígitos' })
  cpf?: string;

  @ApiPropertyOptional({ description: 'Celular com DDD', example: '11999998888' })
  @IsOptional()
  @IsString()
  celular?: string;

  @ApiPropertyOptional({ description: 'Data de nascimento (ISO date YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dataNascimento?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genero?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objetivo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notasClinicas?: string;

  @ApiPropertyOptional({
    description:
      'Configuração opcional para geração de receita mensal no financeiro',
    type: UpdateCobrancaMensalPacienteDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateCobrancaMensalPacienteDto)
  cobrancaMensal?: UpdateCobrancaMensalPacienteDto | null;
}
