import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CreateEnvioDto {
  @ApiProperty({ description: 'ID do paciente' })
  @IsInt()
  @Min(1)
  idPaciente: number;

  @ApiProperty({ description: 'ID do modelo de formulário' })
  @IsInt()
  @Min(1)
  idModelo: number;
}
