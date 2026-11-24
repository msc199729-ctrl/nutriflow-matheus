import { Module } from '@nestjs/common';
import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';
import { PlanoPdfService } from './plano-pdf.service';
import { PacientesModule } from '../pacientes/pacientes.module';

/**
 * Documentos PDF: atestado, recibo, documento livre e plano alimentar timbrado.
 * PrismaModule é @Global no app.module.
 */
@Module({
  imports: [PacientesModule],
  controllers: [DocumentosController],
  providers: [DocumentosService, PlanoPdfService],
  exports: [PlanoPdfService],
})
export class DocumentosModule {}
