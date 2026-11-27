import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, Min } from 'class-validator';

export class MarcarRevisadosDto {
  @ApiProperty({
    description: 'IDs dos envios respondidos que o nutricionista já leu',
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsEnvio: number[];
}
