import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Atualização parcial de meta.
 *
 * Todo campo é opcional porque o uso principal é registrar o progresso
 * (`valorAtual`) sem reescrever a meta inteira.
 */
export class UpdateMetaDto {
  @ApiPropertyOptional({ example: 'Perder 2kg até dezembro' })
  @IsOptional()
  @IsString()
  titulo?: string;

  @ApiPropertyOptional({ example: 'peso' })
  @IsOptional()
  @IsString()
  tipo?: string;

  @ApiPropertyOptional({ example: 83 })
  @IsOptional()
  @IsNumber()
  valorAlvo?: number;

  @ApiPropertyOptional({
    description: 'Valor medido hoje, para calcular o progresso',
    example: 86.5,
  })
  @IsOptional()
  @IsNumber()
  valorAtual?: number | null;

  @ApiPropertyOptional({ example: 'kg' })
  @IsOptional()
  @IsString()
  unidade?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  prazo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  concluida?: boolean;
}
