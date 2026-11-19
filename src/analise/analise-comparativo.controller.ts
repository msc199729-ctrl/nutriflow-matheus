import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { AnaliseComparativoService } from "./analise-comparativo.service";
import type { ComparativoResponse } from "./analise-comparativo.service";

@Controller("pacientes/:idPaciente/analise")
export class AnaliseComparativoController {
  constructor(
    private readonly comparativoService: AnaliseComparativoService,
  ) {}

  @Get("comparativo")
  comparativo(
    @Param("idPaciente", ParseIntPipe) idPaciente: number,
    @Query("dias") dias?: string,
  ): Promise<ComparativoResponse> {
    return this.comparativoService.comparativo(idPaciente, Number(dias) || 7);
  }
}