import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SearchFoodsQueryDto {
  @ApiPropertyOptional({
    description:
      'Texto para busca por nome (ignora acentos e prioriza exato/inicio da palavra)',
    minLength: 2,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Mínimo 2 caracteres para busca por texto' })
  @MaxLength(100)
  texto?: string;
}
