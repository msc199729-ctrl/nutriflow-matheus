import {Body,Controller,Delete,Get,Param,ParseIntPipe,Patch,Post,Query,UseGuards,} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PlanosAlimentaresService } from './planos-alimentares.service';
import { CreatePlanoAlimentarDto } from './dto/create-plano-alimentar.dto';
import { UpdateNomePlanoDto } from './dto/update-nome-plano.dto';
import { UpdatePlanoAlimentarDto } from './dto/update-plano-alimentar.dto';

@Controller('planos-alimentares')
@UseGuards(JwtAuthGuard)
export class PlanosAlimentaresController {
  constructor(
    private readonly planosAlimentaresService: PlanosAlimentaresService,
  ) {}

  @Get('me')
  meuPlano(@CurrentUser() user: JwtPayloadUser) {
    return this.planosAlimentaresService.findPlanoAtivoByPaciente(user);
  }

  @Get('me/todos')
  meusPlanos(@CurrentUser() user: JwtPayloadUser) {
    return this.planosAlimentaresService.findPlanosDisponiveisByPaciente(user);
  }

  @Get()
  listar(
    @Query('idPaciente', ParseIntPipe) idPaciente: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.listByPaciente(idPaciente, user);
  }

  @Post()
  criar(
    @Body() dto: CreatePlanoAlimentarDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.createPlanoNutricionista(dto, user);
  }

  @Post(':id/duplicar')
  duplicar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.duplicarPlano(id, user);
  }

  @Patch(':id/disponibilidade')
  disponibilidade(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { ativo: boolean },
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.definirDisponibilidade(
      id,
      body.ativo === true,
      user,
    );
  }
  @Patch(':id')
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanoAlimentarDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.atualizarPlano(id, dto, user);
  }
  
  @Patch(':id/nome')
  renomear(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNomePlanoDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.renomearPlano(id, dto.nome, user);
  }

  @Delete(':id')
  remover(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.removePlano(id, user);
  }

  @Get(':id/shopping-list')
  listaCompras(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.getShoppingList(id, user);
  }

  @Get(':id/resumo')
  resumo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.getResumoComparativo(id, user);
  }

  @Get(':id')
  detalhe(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.planosAlimentaresService.findOnePlano(id, user);
  }
}