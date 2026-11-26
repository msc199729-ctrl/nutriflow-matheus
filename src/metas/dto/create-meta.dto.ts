import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateMetaDto {
  @ApiProperty({ example: 'Perder 2kg até dezembro' })
  @IsString()
  titulo: string;

  @ApiProperty({ example: 'peso' })
  @IsString()
  tipo: string;

  @ApiProperty({ example: 83 })
  @IsNumber()
  valorAlvo: number;

  @ApiProperty({ example: 'kg' })
  @IsString()
  unidade: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  prazo?: string;

  @ApiPropertyOptional({
    description: 'Valor medido hoje, para calcular o progresso da meta',
    example: 86.5,
  })
  @IsOptional()
  @IsNumber()
  valorAtual?: number;
}
