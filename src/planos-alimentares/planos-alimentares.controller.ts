import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlanosAlimentaresService } from './planos-alimentares.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { CreatePlanoAlimentarDto } from './dto/create-plano-alimentar.dto';

@ApiTags('Planos Alimentares')
@ApiBearerAuth('access-token')
@Controller('planos-alimentares')
export class PlanosAlimentaresController {
  constructor(private readonly planosAlimentaresService: PlanosAlimentaresService) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Plano criado (demais planos ativos do paciente desativados)' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  createPlano(
    @Body() dto: CreatePlanoAlimentarDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.createPlanoNutricionista(dto, user);
  }

  @Get('me')
  @ApiResponse({ status: 200, description: 'Plano ativo do paciente' })
  @ApiResponse({ status: 403, description: 'Apenas paciente' })
  findPlanoAtivo(@CurrentUser() user: JwtPayloadUser) {
    return this.planosAlimentaresService.findPlanoAtivoByPaciente(user);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Lista de planos do paciente (profissional ou o próprio paciente)' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  listByPaciente(
    @Query('idPaciente', ParseIntPipe) idPaciente: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.listByPaciente(idPaciente, user);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Detalhe do plano (refeições e itens)' })
  @ApiResponse({ status: 404, description: 'Não encontrado' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.findOnePlano(id, user);
  }

  @Get(':id/shopping-list')
  @ApiResponse({ status: 200, description: 'Lista de compras consolidada do plano' })
  @ApiResponse({ status: 404, description: 'Plano não encontrado' })
  getShoppingList(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.getShoppingList(id, user);
  }

  @Get(':id/resumo')
  @ApiResponse({ status: 200, description: 'Resumo comparativo: Prescrito vs Necessidade Alvo' })
  @ApiResponse({ status: 404, description: 'Plano não encontrado' })
  getResumoComparativo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.getResumoComparativo(id, user);
  }
}
