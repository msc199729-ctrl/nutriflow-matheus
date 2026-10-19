import { ApiProperty } from '@nestjs/swagger';

export class AdminStatsDto {
  @ApiProperty({ description: 'Total de nutricionistas cadastrados' })
  totalNutricionistas: number;

  @ApiProperty({ description: 'MRR estimado (receita recorrente mensal)' })
  mrrEstimado: number;
}
