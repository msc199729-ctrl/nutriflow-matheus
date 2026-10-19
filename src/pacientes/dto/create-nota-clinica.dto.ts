import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const TIPOS_NOTA = ['consulta', 'exame', 'orientacao', 'atestado', 'recibo'] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];

export class CreateNotaClinicaDto {
  @ApiProperty({ description: 'Texto da nota clínica' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  conteudo: string;

  @ApiPropertyOptional({ description: 'Tipo da nota', enum: TIPOS_NOTA, default: 'consulta' })
  @IsOptional()
  @IsString()
  @IsIn(TIPOS_NOTA)
  tipo?: TipoNota;
}
