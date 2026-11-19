import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateItemDietaDto {
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

export class CreateRefeicaoPlanejadaDto {
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  horarioSugerido?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateItemDietaDto)
  itensDieta: CreateItemDietaDto[];
}

export class CreatePlanoAlimentarDto {
  @IsInt()
  idPaciente: number;

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
  @Type(() => CreateRefeicaoPlanejadaDto)
  refeicoesPlanejadas?: CreateRefeicaoPlanejadaDto[];
}
