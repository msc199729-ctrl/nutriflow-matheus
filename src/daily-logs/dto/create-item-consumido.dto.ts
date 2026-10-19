import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { OrigemDado } from '@prisma/client';

export class CreateItemConsumidoDto {
  @ApiProperty({ description: 'ID do alimento na base' })
  @IsInt()
  @Min(1)
  idAlimento: number;

  @ApiPropertyOptional({ description: 'Quantidade consumida (gramas ou porção)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantidadeConsumida?: number;

  @ApiProperty({ enum: ['busca_manual', 'scanner_codigo_barras', 'reconhecimento_ocr'] })
  @IsEnum(OrigemDado)
  origem: OrigemDado;
}
