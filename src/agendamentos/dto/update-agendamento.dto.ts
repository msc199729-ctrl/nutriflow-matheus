import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAgendamentoDto {
  @ApiPropertyOptional({
    description: 'Nova data e hora (ISO 8601 com timezone obrigatório)',
  })
  @IsOptional()
  @IsDateString()
  inicio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observacao?: string;
}
