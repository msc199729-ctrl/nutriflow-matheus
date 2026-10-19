import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CobrancaMensalPacienteDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativa?: boolean;

  @ApiProperty({ description: 'Valor mensal em reais', example: 250 })
  @IsNumber()
  @Min(0.01)
  valorMensal!: number;

  @ApiProperty({ description: 'Dia de vencimento (1-28)', example: 10 })
  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimento!: number;

  @ApiProperty({ description: 'Início da cobrança (YYYY-MM-DD)' })
  @IsDateString()
  inicioCobranca!: string;

  @ApiPropertyOptional({ example: 'Mensalidade' })
  @IsOptional()
  @IsString()
  categoria?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class CreatePacienteDto {
  @ApiProperty({ example: 'paciente@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'senha123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })
  senha: string;

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
      'Obrigatório para perfil admin_clinica: ID do nutricionista responsável no workspace',
  })
  @IsOptional()
  @IsInt()
  idNutricionistaResponsavel?: number;

  @ApiPropertyOptional({
    description:
      'Configuração opcional para gerar receita mensal automática no financeiro',
    type: CobrancaMensalPacienteDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CobrancaMensalPacienteDto)
  cobrancaMensal?: CobrancaMensalPacienteDto;
}
