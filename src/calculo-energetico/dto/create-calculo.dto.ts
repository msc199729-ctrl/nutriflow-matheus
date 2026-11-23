import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateCalculoDto {
  @Type(() => Number)
  @IsInt()
  idPaciente: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idPlanoAlimentar?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(20)
  pesoKg: number;

  @Type(() => Number)
  @IsNumber()
  @Min(50)
  alturaCm: number;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  idadeAnos: number;

  @IsIn(['M', 'F'])
  sexo: 'M' | 'F';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  massaMagraKg?: number | null;

  @IsString()
  formula: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fatorAtividade?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fatorInjuria?: number;

  @IsOptional()
  @IsIn(['SEDENTARIO', 'BAIXO', 'ATIVO', 'MUITO_ATIVO'])
  eerNivel?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adicionalMet?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adicionalVenta?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adicionalGestante?: number | null;

  @ValidateIf((o) => o.formula === 'TMB_MANUAL')
  @Type(() => Number)
  @IsNumber()
  tmbManual?: number;

  @ValidateIf((o) => o.formula === 'GET_MANUAL')
  @Type(() => Number)
  @IsNumber()
  getManual?: number;
}