import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNutricionistaAdminResponseDto {
  @ApiProperty()
  id: number;
  @ApiProperty()
  email: string;
  @ApiPropertyOptional({ nullable: true })
  nome: string | null;
  @ApiPropertyOptional({ nullable: true })
  crn: string | null;
  @ApiProperty({ enum: ['crn', 'crm'] })
  tipoConselho: 'crn' | 'crm';
  @ApiProperty()
  workspaceId: number;
}
