import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export enum TipoPlanoDto {
  QUALITATIVO = 'QUALITATIVO',
  POR_ALIMENTOS = 'POR_ALIMENTOS',
}

export class CreateItemPlanoDto {
  @ApiProperty()
  @IsInt()
  idAlimento: number;

  @ApiPropertyOptional({ description: 'Quantidade em gramas' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  quantidadeGramas?: number;

  @ApiPropertyOptional({ description: 'Medida caseira (ex: 1 colher de sopa)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  medidaCaseira?: string;

  @ApiPropertyOptional({ description: 'Alimento consumido à vontade', default: false })
  @IsOptional()
  @IsBoolean()
  aVontade?: boolean;

  @ApiPropertyOptional({ description: 'Grupo de substituição (alimentos com mesmo grupo são intercambiáveis)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  idGrupoSubstituicao?: number;
}

export class CreateRefeicaoPlanoDto {
  @ApiProperty({ example: 'Café da manhã' })
  @IsString()
  @MaxLength(120)
  nome: string;

  @ApiProperty({ example: '07:30', description: 'Horário HH:mm' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use o formato HH:mm' })
  horario: string;

  @ApiProperty({ type: [CreateItemPlanoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateItemPlanoDto)
  itens: CreateItemPlanoDto[];
}

export class CreatePlanoAlimentarDto {
  @ApiProperty()
  @IsInt()
  idPaciente: number;

  @ApiPropertyOptional({ example: 'Plano hipocalórico' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @ApiProperty({ enum: TipoPlanoDto, description: 'Tipo do plano alimentar' })
  @IsEnum(TipoPlanoDto)
  tipoPlano: TipoPlanoDto;

  @ApiPropertyOptional({ description: 'Descrição qualitativa (texto rico) — obrigatório quando tipoPlano = QUALITATIVO' })
  @ValidateIf((o) => o.tipoPlano === TipoPlanoDto.QUALITATIVO)
  @IsString()
  descricaoQualitativa?: string;

  @ApiPropertyOptional({ description: 'Meta de água em litros/dia' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  metaAguaLitros?: number;

  @ApiPropertyOptional({ type: [CreateRefeicaoPlanoDto] })
  @ValidateIf((o) => o.tipoPlano === TipoPlanoDto.POR_ALIMENTOS)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRefeicaoPlanoDto)
  refeicoes?: CreateRefeicaoPlanoDto[];
}
