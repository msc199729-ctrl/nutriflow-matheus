import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AguaService } from './agua.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RegistrarAguaDto } from './dto/registrar-agua.dto';

/**
 * Água do paciente.
 *
 * Vive fora de `/registros-diarios` de propósito: beber água não é refeição, e
 * misturar os dois enchia o diário alimentar de registros vazios. O app do
 * paciente já chamava `POST/DELETE /registros-diarios/agua` — e essas rotas
 * não existiam no backend.
 */
@ApiTags('Água')
@ApiBearerAuth('access-token')
@Controller('registros-diarios/agua')
export class AguaController {
  constructor(private readonly aguaService: AguaService) {}

  @Get()
  @ApiQuery({ name: 'data', required: false, description: 'Data YYYY-MM-DD (padrão: hoje)' })
  @ApiQuery({ name: 'idPaciente', required: false, description: 'Obrigatório para nutricionista/admin' })
  @ApiResponse({ status: 200, description: 'Ingestões do dia e total em ml' })
  listar(
    @Query('data') data: string | undefined,
    @Query('idPaciente') idPaciente: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const id = idPaciente ? Number.parseInt(idPaciente, 10) : undefined;
    return this.aguaService.listar(
      user,
      data,
      id != null && Number.isFinite(id) ? id : undefined,
    );
  }

  @Post()
  @ApiResponse({ status: 201, description: 'Copo registrado' })
  @ApiResponse({ status: 400, description: 'Quantidade fora de 50–1500 ml' })
  registrar(
    @Body() dto: RegistrarAguaDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.aguaService.registrar(user, dto.quantidadeMl, dto.idPaciente);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Registro desfeito' })
  @ApiResponse({ status: 404, description: 'Registro não encontrado' })
  remover(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.aguaService.remover(user, id);
  }
}
