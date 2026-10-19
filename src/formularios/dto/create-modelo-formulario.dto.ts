import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateModeloFormularioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titulo?: string;

  @ApiPropertyOptional({ description: 'Frequência de envio em dias' })
  @IsOptional()
  @IsInt()
  @Min(1)
  frequenciaDias?: number;
}
