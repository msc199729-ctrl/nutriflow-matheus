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

export class UpdateItemSubstitutoDto {
  @IsInt()
  idAlimento: number;

  @IsOptional()
  @IsNumber()
  quantidadeGramas?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
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
  ordem?: number;
}

export class UpdateItemDietaDto {
  @IsInt()
  idAlimento: number;

  @IsOptional()
  @IsNumber()
  quantidadeGramas?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateItemSubstitutoDto)
  substitutos?: UpdateItemSubstitutoDto[];
}

export class UpdateRefeicaoPlanejadaDto {
  @IsString()
  @MaxLength(80)
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