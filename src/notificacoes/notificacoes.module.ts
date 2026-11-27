import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';
import { AvisosWhatsappService } from './avisos-whatsapp.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificacoesController],
  providers: [NotificacoesService, AvisosWhatsappService],
  exports: [NotificacoesService, AvisosWhatsappService],
})
export class NotificacoesModule {}
