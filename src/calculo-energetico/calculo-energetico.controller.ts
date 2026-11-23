import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CalculoEnergeticoService } from './calculo-energetico.service';
import { CreateCalculoDto } from './dto/create-calculo.dto';

@Controller('calculo-energetico')
export class CalculoEnergeticoController {
  constructor(private readonly service: CalculoEnergeticoService) {}

  @Post('previa')
  previa(@Body() dto: CreateCalculoDto) {
    return this.service.previsto(dto);
  }

  @Post()
  salvar(@Body() dto: CreateCalculoDto) {
    return this.service.salvar(dto);
  }

  @Get('paciente/:idPaciente')
  porPaciente(@Param('idPaciente', ParseIntPipe) idPaciente: number) {
    return this.service.porPaciente(idPaciente);
  }

  @Patch(':id/distribuicao')
  distribuicao(
    @Param('id', ParseIntPipe) id: number,
    @Body() dados: Record<string, unknown>,
  ) {
    return this.service.definirDistribuicao(id, dados as never);
  }

  @Patch(':id/plano')
  vincular(
    @Param('id', ParseIntPipe) id: number,
    @Body('idPlanoAlimentar', ParseIntPipe) idPlanoAlimentar: number,
  ) {
    return this.service.vincularAoPlano(id, idPlanoAlimentar);
  }
}