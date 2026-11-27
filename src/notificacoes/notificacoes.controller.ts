import { Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificacoesService } from './notificacoes.service';
import { AvisosWhatsappService } from './avisos-whatsapp.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notificações')
@ApiBearerAuth('access-token')
@Controller('notificacoes')
export class NotificacoesController {
  constructor(
    private readonly notificacoes: NotificacoesService,
    private readonly avisos: AvisosWhatsappService,
  ) {}

  @Get('minhas')
  @ApiResponse({
    status: 200,
    description: 'Caixa de entrada do paciente (itens das últimas 50 e total de não lidas)',
  })
  minhas(@CurrentUser() user: JwtPayloadUser) {
    return this.notificacoes.minhas(user);
  }

  /**
   * Texto e link de WhatsApp prontos para o nutricionista clicar. Fica junto das
   * notificações de propósito: os dois canais dizem a mesma coisa, e o app é o
   * destino — o WhatsApp é só o sino.
   */
  @Get('aviso-whatsapp')
  @ApiResponse({ status: 200, description: 'Link wa.me com a mensagem pronta' })
  avisoWhatsapp(
    @Query('idPaciente', ParseIntPipe) idPaciente: number,
    @Query('tipo') tipo: 'formulario' | 'plano',
    @Query('idEnvio') idEnvio: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    const envio = idEnvio ? Number.parseInt(idEnvio, 10) : undefined;
    return this.avisos.linkAviso(
      idPaciente,
      tipo === 'plano' ? 'plano' : 'formulario',
      user,
      { idEnvio: envio != null && Number.isFinite(envio) ? envio : undefined },
    );
  }

  @Patch('lidas')
  @ApiResponse({ status: 200, description: 'Todas as notificações do paciente marcadas como lidas' })
  marcarTodasLidas(@CurrentUser() user: JwtPayloadUser) {
    return this.notificacoes.marcarTodasLidas(user);
  }

  @Patch(':id/lida')
  @ApiResponse({ status: 200, description: 'Notificação marcada como lida' })
  marcarLida(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.notificacoes.marcarLida(id, user);
  }
}
