import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { CreateItemConsumidoDto } from './create-item-consumido.dto';

export class CreateRegistroDiarioDto {
  @ApiPropertyOptional({ description: 'ID do paciente (obrigatório se nutricionista criar para outro)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  idPaciente?: number;

  @ApiPropertyOptional({ description: 'Tipo de refeição (ex: café, almoço, jantar)' })
  @IsOptional()
  @IsString()
  tipoRefeicao?: string;

  @ApiPropertyOptional({ description: 'Ingestão de água em ml' })
  @IsOptional()
  @IsInt()
  @Min(0)
  ingestaoAguaMl?: number;
    @ApiPropertyOptional({ description: 'Horas de sono do dia' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  horasSono?: number;

  @ApiPropertyOptional({ description: 'Peso do dia em kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pesoKg?: number;

  @ApiPropertyOptional({ description: 'Itens consumidos (alimentos)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateItemConsumidoDto)
  itens?: CreateItemConsumidoDto[];
}
