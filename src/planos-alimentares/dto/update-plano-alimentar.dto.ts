import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateItemDietaDto {
  @IsInt()
  idAlimento: number;

  @IsOptional()
  @IsNumber()
  quantidadeGramas?: number | null;

  @IsOptional()
  @IsString()
  medidaCaseira?: string | null;

  @IsOptional()
  @IsString()
  idMedidaCaseira?: string | null;

  @IsOptional()
  @IsNumber()
  quantidadeMedida?: number | null;

  @IsOptional()
  @IsBoolean()
  aVontade?: boolean;

  @IsOptional()
  @IsInt()
  idGrupoSubstituicao?: number | null;
}

export class UpdateRefeicaoPlanejadaDto {
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  horarioSugerido?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateItemDietaDto)
  itensDieta: UpdateItemDietaDto[];
}

export class UpdatePlanoAlimentarDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nome?: string;

  @IsOptional()
  @IsIn(['QUALITATIVO', 'POR_ALIMENTOS'])
  tipoPlano?: 'QUALITATIVO' | 'POR_ALIMENTOS';

  @IsOptional()
  @IsString()
  descricaoQualitativa?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  metaAguaLitros?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRefeicaoPlanejadaDto)
  refeicoesPlanejadas?: UpdateRefeicaoPlanejadaDto[];
}