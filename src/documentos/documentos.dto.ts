import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

class ProfissionalOpcionalDto {
  @IsOptional()
  @IsString()
  nutricionistaNome?: string;

  @IsOptional()
  @IsString()
  nutricionistaEspecialidade?: string;

  @IsOptional()
  @IsString()
  conselhoTipo?: string;

  @IsOptional()
  @IsString()
  conselhoNumero?: string;
}

export class AtestadoDto extends ProfissionalOpcionalDto {
  @Type(() => Number)
  @IsInt()
  idPaciente: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data deve ser AAAA-MM-DD' })
  data: string;

  @Matches(/^\d{2}:\d{2}$/, { message: 'horaInicio deve ser HH:mm' })
  horaInicio: string;

  @Matches(/^\d{2}:\d{2}$/, { message: 'horaFim deve ser HH:mm' })
  horaFim: string;

  @IsString()
  finalidade: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsString()
  cidade: string;
}

export class ReciboDto extends ProfissionalOpcionalDto {
  @Type(() => Number)
  @IsInt()
  idPaciente: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  valor: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  meses: number;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsString()
  formaPagamento: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  vigenciaInicio: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  vigenciaFim: string;

  @IsString()
  cidade: string;
}

export class DocumentoLivreDto extends ProfissionalOpcionalDto {
  @Type(() => Number)
  @IsInt()
  idPaciente: number;

  @IsString()
  titulo: string;

  @IsString()
  corpo: string;

  @IsString()
  cidade: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  data: string;
}