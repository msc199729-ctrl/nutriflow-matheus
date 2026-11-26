import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const STATUS_CONSULTA = ['agendada', 'realizada', 'faltou', 'cancelada'] as const;

export class UpdateAgendamentoDto {
  @ApiPropertyOptional({
    description: 'Nova data e hora (ISO 8601 com timezone obrigatório)',
  })
  @IsOptional()
  @IsDateString()
  inicio?: string;

  @ApiPropertyOptional({
    description: 'Duração em minutos (10 a 480).',
    example: 60,
    minimum: 10,
    maximum: 480,
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(480)
  duracaoMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observacao?: string;

  @ApiPropertyOptional({
    description:
      'agendada = ainda vai acontecer; realizada = atendida; faltou = no-show; cancelada = desmarcada.',
    enum: STATUS_CONSULTA,
  })
  @IsOptional()
  @IsIn(STATUS_CONSULTA)
  status?: (typeof STATUS_CONSULTA)[number];
}
