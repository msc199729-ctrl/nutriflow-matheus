import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAgendamentoDto {
  @ApiProperty({ description: 'ID do paciente' })
  @IsInt()
  @Min(1)
  idPaciente!: number;

  @ApiProperty({
    description:
      'Data e hora de início da consulta (ISO 8601 com timezone obrigatório)',
    example: '2025-06-15T14:30:00.000Z',
  })
  @IsDateString()
  inicio!: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observacao?: string;
}
