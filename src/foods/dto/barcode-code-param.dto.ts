import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Parâmetro de rota `:code` — remove não dígitos antes de validar (8–14 dígitos). */
export class BarcodeCodeParamDto {
  @ApiProperty({
    description: 'Código de barras (8 a 14 dígitos, ex.: EAN-13)',
    example: '7891234567890',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : '',
  )
  @IsString()
  @MinLength(8, { message: 'Código de barras deve ter entre 8 e 14 dígitos' })
  @MaxLength(14, { message: 'Código de barras deve ter entre 8 e 14 dígitos' })
  @Matches(/^\d+$/, { message: 'Código de barras deve conter apenas dígitos' })
  code!: string;
}
