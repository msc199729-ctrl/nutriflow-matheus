import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FoodsService } from './foods.service';
import { SearchFoodsQueryDto } from './dto/search-foods.dto';

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
  @ApiResponse({ status: 200, description: 'Lista de alimentos encontrados (retorna [] se query vazia)' })
  async search(@Query() query: SearchFoodsQueryDto) {
    if (!query.texto || query.texto.trim().length < 2) return [];
    return this.foodsService.searchByText(query.texto);
  }

  @Get('codigo-barras/:codigo')
  @ApiParam({ name: 'codigo', description: 'Código de barras (EAN-13 ou similar)' })
  @ApiResponse({ status: 200, description: 'Alimento encontrado (local ou Open Food Facts)' })
  @ApiResponse({ status: 404, description: 'Alimento não encontrado' })
  async findByBarcode(@Param('codigo') codigo: string) {
    const alimento = await this.foodsService.findByBarcode(codigo);
    if (!alimento) return null;
    return alimento;
  }
}
