import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListNutricionistasQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Trecho do número (CRN/CRM), nome ou e-mail (case insensitive)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  busca?: string;

  @ApiPropertyOptional({
    enum: ['crn', 'crm'],
    description: 'Quando informado, restringe aos profissionais desse conselho (útil para distinguir números iguais)',
  })
  @IsOptional()
  @IsIn(['crn', 'crm'])
  tipoConselho?: 'crn' | 'crm';
}
