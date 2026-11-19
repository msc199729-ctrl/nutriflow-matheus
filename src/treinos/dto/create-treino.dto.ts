import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTreinoDto {
  @ApiProperty({ example: '2026-10-20' })
  @IsDateString()
  data: string;

  @ApiProperty({ example: 'musculação' })
  @IsString()
  tipo: string;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(1)
  duracaoMin: number;

  @ApiProperty({ example: 'alta' })
  @IsString()
  intensidade: string;

  @ApiPropertyOptional({ example: 'Foco em membros inferiores' })
  @IsOptional()
  @IsString()
  observacoes?: string;
}