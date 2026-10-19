import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class QueryAgendamentosDto {
  @ApiPropertyOptional({
    description: 'Início do intervalo (YYYY-MM-DD), no fuso America/Sao_Paulo',
    example: '2025-03-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  de?: string;

  @ApiPropertyOptional({
    description: 'Fim do intervalo (YYYY-MM-DD), no fuso America/Sao_Paulo',
    example: '2025-03-31',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  ate?: string;
}
