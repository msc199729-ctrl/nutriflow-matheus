import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Clínica Exemplo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nome: string;

  @ApiPropertyOptional({ example: '12.345.678/0001-90' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  documento?: string;

  @ApiPropertyOptional({ example: 'Ativo' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  statusAssinatura?: string;
}
