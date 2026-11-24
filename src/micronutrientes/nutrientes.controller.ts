import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NutrientesPlanoService } from './nutrientes-plano.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('Nutrientes')
@ApiBearerAuth('access-token')
@Controller()
export class NutrientesController {
  constructor(private readonly nutrientes: NutrientesPlanoService) {}

  /**
   * Totais de micronutrientes de um plano salvo, comparados com a DRI do paciente.
   * É o endpoint da aba "Ver total de nutrientes".
   */
  @Get('planos-alimentares/:id/nutrientes')
  @ApiParam({ name: 'id', description: 'ID do plano alimentar' })
  @ApiResponse({
    status: 200,
    description:
      'Totais por nutriente (prescrito × referência), agrupados em minerais, vitaminas e gorduras',
  })
  @ApiResponse({ status: 404, description: 'Plano não encontrado' })
  nutrientesDoPlano(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.nutrientes.nutrientesDoPlano(id, user);
  }

  /**
   * Só as referências (RDA/AI) do paciente. Serve para o gerador de dietas em
   * memória, que ainda não tem plano salvo para consultar.
   */
  @Get('pacientes/:idPaciente/nutrientes-referencia')
  @ApiParam({ name: 'idPaciente', description: 'ID do paciente' })
  @ApiResponse({ status: 200, description: 'Referências DRI por nutriente' })
  referencias(
    @Param('idPaciente', ParseIntPipe) idPaciente: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.nutrientes.referenciasDoPaciente(idPaciente, user);
  }
}
