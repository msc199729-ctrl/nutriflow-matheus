import { Module } from '@nestjs/common';
import { FormulariosController } from './formularios.controller';
import { FormulariosPublicoController } from './formularios-publico.controller';
import { FormulariosService } from './formularios.service';
import { FormulariosPublicoService } from './formularios-publico.service';

@Module({
  controllers: [FormulariosController, FormulariosPublicoController],
  providers: [FormulariosService, FormulariosPublicoService],
  exports: [FormulariosService, FormulariosPublicoService],
})
export class FormulariosModule {}
