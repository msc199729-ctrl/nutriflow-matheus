import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RegistrarAguaDto {
  @ApiProperty({ description: 'Quantidade em mililitros (50 a 1500)', example: 300 })
  @Type(() => Number)
  @IsInt()
  @Min(50, { message: 'Informe pelo menos 50 ml.' })
  @Max(1500, { message: 'Máximo de 1500 ml por registro.' })
  quantidadeMl: number;

  @ApiPropertyOptional({
    description: 'ID do paciente (obrigatório se nutricionista registra por ele)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPaciente?: number;
}
