import {Body,Controller,Delete,Get,Param,ParseIntPipe,Patch,Post,Query,UseGuards,} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PlanosAlimentaresService } from './planos-alimentares.service';
import { CreatePlanoAlimentarDto } from './dto/create-plano-alimentar.dto';
import { UpdateNomePlanoDto } from './dto/update-nome-plano.dto';
import { UpdatePlanoAlimentarDto } from './dto/update-plano-alimentar.dto';
import { NotificacoesService, TipoNotificacao } from '../notificacoes/notificacoes.service';

@Controller('planos-alimentares')
@UseGuards(JwtAuthGuard)
export class PlanosAlimentaresController {
  constructor(
    private readonly planosAlimentaresService: PlanosAlimentaresService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /**
   * Avisa o paciente que há plano (novo ou editado) no app.
   *
   * Nunca lança — `NotificacoesService.criarSeNovo` engole o erro de propósito:
   * um aviso que falha não pode desfazer a publicação do plano. E deduplica por
   * plano em 12 h, então salvar várias vezes no mesmo dia não enche a caixa.
   *
   * Fica no controller, e não no serviço, para não reescrever arquivos grandes
   * já no repo.
   */
  private async avisarPlano(
    idPaciente: number,
    idPlano: number,
    atualizacao: boolean,
  ): Promise<void> {
    await this.notificacoes.criarSeNovo({
      idPaciente,
      tipo: TipoNotificacao.planoPublicado,
      titulo: atualizacao
        ? 'Seu planejamento alimentar foi atualizado'
        : 'Seu planejamento alimentar está disponível',
      mensagem: atualizacao
        ? 'Seu nutricionista atualizou seu plano alimentar. Abra o app para ver as refeições, porções, substitutos e a lista de compras.'
        : 'Seu nutricionista publicou seu plano alimentar. Abra o app para ver as refeições, porções, substitutos e a lista de compras.',
      idReferencia: idPlano,
    });
  }

  /**
   * Plano ativo do paciente logado.
   *
   * `findFirst` sem ordem, com mais de um plano ativo, devolve o que o Postgres
   * quiser — e o app abria um plano ao acaso, às vezes o velho, no lugar do que
   * o nutricionista acabou de salvar. Aqui a escolha é explícita: o mais
   * recente ganha (`dataInicio` e, no empate do mesmo dia, o `id` maior).
   *
   * Ter dois planos ativos para o mesmo paciente continua sendo erro de dado
   * (o `PATCH /:id/disponibilidade` deveria desligar o outro); até isso ser
   * resolvido na origem, o paciente vê sempre o mais novo.
   */
  @Get('me')
  async meuPlano(@CurrentUser() user: JwtPayloadUser) {
    const planos = await this.planosAlimentaresService.findPlanosDisponiveisByPaciente(user);
    const hoje = new Date();
    const vigentes = planos.filter(
      (p) => p.dataInicio == null || new Date(p.dataInicio) <= hoje,
    );
    const candidatos = vigentes.length > 0 ? vigentes : planos;
    if (candidatos.length === 0) return null;
    return [...candidatos].sort((a, b) => {
      const da = a.dataInicio ? new Date(a.dataInicio).getTime() : 0;
      const db = b.dataInicio ? new Date(b.dataInicio).getTime() : 0;
      return db - da || b.id - a.id;
    })[0];
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
  async criar(
    @Body() dto: CreatePlanoAlimentarDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const plano = await this.planosAlimentaresService.createPlanoNutricionista(dto, user);
    // O plano nasce ativo: é o que o paciente abre no app. Avisar aqui evita
    // plano publicado sem aviso — antes ele só sabia se você mandasse zap.
    await this.avisarPlano(dto.idPaciente, plano.id, false);
    return plano;
  }

  @Post(':id/duplicar')
  duplicar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    // A cópia nasce desligada (`ativo: false`), então NÃO avisa: ela só chega ao
    // paciente quando for ligada em `PATCH /:id/disponibilidade`, e é lá que o
    // aviso nasce.
    return this.planosAlimentaresService.duplicarPlano(id, user);
  }

  @Patch(':id/disponibilidade')
  async disponibilidade(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { ativo: boolean },
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const resultado = await this.planosAlimentaresService.definirDisponibilidade(
      id,
      body.ativo === true,
      user,
    );
    // Ligar um plano é o momento em que ele passa a existir para o paciente.
    // Sem isto, um plano duplicado (que nasce desligado) nunca gerava aviso.
    if (resultado.ativo) {
      await this.avisarPlano(resultado.idPaciente, id, false);
    }
    return resultado;
  }

  @Patch(':id')
  async atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanoAlimentarDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const plano = await this.planosAlimentaresService.atualizarPlano(id, dto, user);
    // Editar um plano que está no ar entrega uma versão nova ao paciente. Antes
    // só o POST avisava, então salvar por cima do plano existente — que é o que
    // o app faz no segundo save — não gerava aviso nenhum.
    if (plano.ativo) {
      await this.avisarPlano(plano.idPaciente, plano.id, true);
    }
    return plano;
  }

  @Patch(':id/nome')
  renomear(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNomePlanoDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    // Nome do plano é organização interna do nutricionista, não novidade para o
    // paciente — renomear não gera aviso.
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
