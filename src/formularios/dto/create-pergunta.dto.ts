import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreatePerguntaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textoPergunta?: string;

  @ApiPropertyOptional({ description: 'Ex: texto, numero, multipla_escolha' })
  @IsOptional()
  @IsString()
  tipoResposta?: string;

  @ApiPropertyOptional({ description: 'Tag para análise por IA' })
  @IsOptional()
  @IsString()
  tagAnalise?: string;

  @ApiPropertyOptional({
    description:
      'Rótulos das opções para múltipla escolha (ordem = ordem exibida ao paciente)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  opcoes?: string[];

  @ApiPropertyOptional({ description: 'Se a resposta é obrigatória' })
  @IsOptional()
  @IsBoolean()
  obrigatoria?: boolean;
}
