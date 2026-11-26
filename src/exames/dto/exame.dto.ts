import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ItemExameDto {
  @ApiProperty({ example: 'Ferritina' })
  @IsString()
  @MaxLength(120)
  nome: string;

  @ApiPropertyOptional({ example: 18.4 })
  @IsOptional()
  @IsNumber()
  valor?: number | null;

  @ApiPropertyOptional({ example: 'ng/mL' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unidade?: string;

  @ApiPropertyOptional({ example: 15, description: 'Limite inferior da referência' })
  @IsOptional()
  @IsNumber()
  referenciaMin?: number | null;

  @ApiPropertyOptional({ example: 150, description: 'Limite superior da referência' })
  @IsOptional()
  @IsNumber()
  referenciaMax?: number | null;

  @ApiPropertyOptional({
    example: 'não reagente',
    description: 'Resultado não numérico, quando o laudo não tem valor',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resultadoTexto?: string;
}

export class CreateExameDto {
  @ApiProperty({ example: '2026-11-20', description: 'Data da COLETA' })
  @IsDateString()
  dataColeta: string;

  @ApiPropertyOptional({ example: 'Lab São Lucas' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  laboratorio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observacoes?: string;

  @ApiProperty({ type: [ItemExameDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemExameDto)
  itens: ItemExameDto[];
}

export class UpdateExameDto {
  @ApiPropertyOptional({ example: '2026-11-20', description: 'Data da COLETA' })
  @IsOptional()
  @IsDateString()
  dataColeta?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  laboratorio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observacoes?: string;

  @ApiPropertyOptional({
    type: [ItemExameDto],
    description: 'Substitui a lista inteira de itens do exame',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemExameDto)
  itens?: ItemExameDto[];
}
