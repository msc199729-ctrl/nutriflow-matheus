import { Module } from '@nestjs/common';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';
import { ProfissionalService } from '../documentos/profissional.service';

@Module({
  controllers: [RelatoriosController],
  providers: [RelatoriosService, ProfissionalService],
})
export class RelatoriosModule {}
