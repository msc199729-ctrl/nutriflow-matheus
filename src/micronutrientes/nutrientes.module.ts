import { Module } from '@nestjs/common';
import { NutrientesController } from './nutrientes.controller';
import { NutrientesPlanoService } from './nutrientes-plano.service';
import { PacientesModule } from '../pacientes/pacientes.module';

/**
 * Micronutrientes: agregação do plano e comparação com a DRI.
 *
 * PrismaModule é @Global no app.module, portanto não precisa ser importado.
 *
 * Registrar em `app.module.ts`:
 *   import { NutrientesModule } from './micronutrientes/nutrientes.module';
 *   @Module({ imports: [..., NutrientesModule] })
 */
@Module({
  imports: [PacientesModule],
  controllers: [NutrientesController],
  providers: [NutrientesPlanoService],
  exports: [NutrientesPlanoService],
})
export class NutrientesModule {}
