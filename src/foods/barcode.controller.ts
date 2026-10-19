import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BarcodeCodeParamDto } from './dto/barcode-code-param.dto';
import { FoodsService } from './foods.service';
import { BarcodeUpstreamError } from './errors/barcode-upstream.error';

@ApiTags('Código de barras')
@ApiBearerAuth('access-token')
@Controller('barcode')
export class BarcodeController {
  constructor(private readonly foodsService: FoodsService) {}

  @Get(':code')
  @ApiParam({ name: 'code', description: 'Código de barras (8–14 dígitos)' })
  @ApiResponse({ status: 200, description: 'Alimento encontrado (cache local ou Open Food Facts)' })
  @ApiResponse({ status: 400, description: 'Código inválido' })
  @ApiResponse({ status: 404, description: 'Produto não encontrado' })
  @ApiResponse({
    status: 503,
    description: 'Falha ao consultar serviço externo (rede/timeout)',
  })
  async getByCode(@Param() params: BarcodeCodeParamDto) {
    try {
      const alimento = await this.foodsService.findByBarcodeStrict(params.code);
      if (!alimento) {
        throw new NotFoundException('Produto não encontrado');
      }
      return alimento;
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      if (e instanceof BarcodeUpstreamError) {
        throw new ServiceUnavailableException(
          'Não foi possível consultar a base externa de produtos. Tente novamente.',
        );
      }
      throw e;
    }
  }
}
