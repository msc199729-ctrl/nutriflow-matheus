import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class ResumoClinicoDto {
  @ApiProperty({ description: 'ID do paciente' })
  @IsInt()
  @Min(1)
  idPaciente: number;
}
