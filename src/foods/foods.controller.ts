import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FoodsService } from './foods.service';
import { SearchFoodsQueryDto } from './dto/search-foods.dto';
import { RenomearAlimentoDto } from './dto/renomear-alimento.dto';

@ApiTags('Alimentos')
@ApiBearerAuth('access-token')
@Controller('alimentos')
export class FoodsController {
  constructor(private readonly foodsService: FoodsService) {}

  @Get('busca')
  @ApiQuery({
    name: 'texto',
    required: true,
    description: 'Busca por nome do alimento (mínimo 2 caracteres)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de alimentos encontrados (retorna [] se query vazia)',
  })
  async search(@Query() query: SearchFoodsQueryDto) {
    if (!query.texto || query.texto.trim().length < 2) return [];
    return this.foodsService.searchByText(query.texto);
  }

  @Get('catalogo')
  @ApiResponse({
    status: 200,
    description: 'Catálogo completo para busca local no cliente',
  })
  async catalogo() {
    return this.foodsService.catalogoBusca();
  }
  @Get('mais-usados')
  @ApiQuery({
    name: 'limite',
    required: false,
    description: 'Quantidade de alimentos a retornar (padrão 60, máximo 200)',
  })
  @ApiResponse({
    status: 200,
    description: 'Alimentos mais prescritos, com contagem de uso',
  })
  async maisUsados(@Query('limite') limite?: string) {
    return this.foodsService.maisUsadosAlimentos(Number(limite) || 60);
  }

  @Get('codigo-barras/:codigo')
  @ApiParam({
    name: 'codigo',
    description: 'Código de barras (EAN-13 ou similar)',
  })
  @ApiResponse({
    status: 200,
    description: 'Alimento encontrado (local ou Open Food Facts)',
  })
  @ApiResponse({ status: 404, description: 'Alimento não encontrado' })
  async findByBarcode(@Param('codigo') codigo: string) {
    const alimento = await this.foodsService.findByBarcode(codigo);
    if (!alimento) return null;
    return alimento;
  }

  @Patch(':id/nome')
  @ApiParam({ name: 'id', description: 'ID do alimento' })
  @ApiResponse({ status: 200, description: 'Nome de exibição atualizado' })
  @ApiResponse({ status: 404, description: 'Alimento não encontrado' })
  async renomear(
    @Param('id') id: string,
    @Body() dto: RenomearAlimentoDto,
  ) {
    return this.foodsService.renomearAlimento(Number(id), dto.nomeExibicao);
  }
}