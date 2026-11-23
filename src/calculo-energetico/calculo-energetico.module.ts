import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CalculoEnergeticoController } from './calculo-energetico.controller';
import { CalculoEnergeticoService } from './calculo-energetico.service';

@Module({
  imports: [PrismaModule],
  controllers: [CalculoEnergeticoController],
  providers: [CalculoEnergeticoService],
  exports: [CalculoEnergeticoService],
})
export class CalculoEnergeticoModule {}