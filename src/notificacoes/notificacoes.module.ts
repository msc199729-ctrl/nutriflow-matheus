import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';
import { AvisosWhatsappService } from './avisos-whatsapp.service';
import { DispositivosPushController } from './dispositivos-push.controller';
import { PushService } from './push.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificacoesController, DispositivosPushController],
  providers: [NotificacoesService, AvisosWhatsappService, PushService],
  exports: [NotificacoesService, AvisosWhatsappService, PushService],
})
export class NotificacoesModule {}
