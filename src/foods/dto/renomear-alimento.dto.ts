import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenomearAlimentoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nomeExibicao: string;
}