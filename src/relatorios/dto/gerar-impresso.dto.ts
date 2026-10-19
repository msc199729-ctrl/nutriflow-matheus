import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum TipoImpresso {
  PRESCRICAO_ALIMENTAR = 'prescricao_alimentar',
  LAUDO_NUTRICIONAL = 'laudo_nutricional',
  ORIENTACOES_NUTRICIONAIS = 'orientacoes_nutricionais',
  ATESTADO_NUTRICIONAL = 'atestado_nutricional',
  RECEITUARIO_PERSONALIZADO = 'receituario_personalizado',
}

export class GerarImpressoDto {
  @ApiProperty({ description: 'ID do paciente' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPaciente!: number;

  @ApiProperty({ enum: TipoImpresso })
  @IsEnum(TipoImpresso)
  tipo!: TipoImpresso;

  @ApiPropertyOptional({
    description: 'Título customizado do documento',
    example: 'Laudo Nutricional',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titulo?: string;

  @ApiPropertyOptional({
    description: 'Conteúdo principal para laudo/orientações/receituário',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  conteudo?: string;

  @ApiPropertyOptional({
    description: 'Observações adicionais para o impresso',
  })
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  observacoes?: string;

  @ApiPropertyOptional({
    description: 'Se true, inclui o plano alimentar ativo no impresso de prescrição',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  incluirPlanoAtivo?: boolean;
}
