import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { FormulariosController } from './formularios.controller';
import { FormulariosPublicoController } from './formularios-publico.controller';
import { FormulariosService } from './formularios.service';
import { FormulariosPublicoService } from './formularios-publico.service';
import { FormulariosRecorrenciaService } from './formularios-recorrencia.service';

@Module({
  imports: [NotificacoesModule],
  controllers: [FormulariosController, FormulariosPublicoController],
  providers: [
    FormulariosService,
    FormulariosPublicoService,
    FormulariosRecorrenciaService,
  ],
  exports: [
    FormulariosService,
    FormulariosPublicoService,
    FormulariosRecorrenciaService,
  ],
})
export class FormulariosModule {}
