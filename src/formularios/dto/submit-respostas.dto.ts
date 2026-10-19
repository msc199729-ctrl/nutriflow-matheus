import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class RespostaItemDto {
  @ApiProperty({ description: 'ID da pergunta' })
  @IsInt()
  @Min(1)
  idPergunta: number;

  @ApiPropertyOptional({ description: 'Valor da resposta' })
  @IsOptional()
  @IsString()
  valorResposta?: string;
}

export class SubmitRespostasDto {
  @ApiProperty({ type: [RespostaItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RespostaItemDto)
  respostas: RespostaItemDto[];
}
