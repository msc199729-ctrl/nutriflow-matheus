import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PacientesModule } from '../pacientes/pacientes.module';
import { PlanosAlimentaresController } from './planos-alimentares.controller';
import { PlanosAlimentaresService } from './planos-alimentares.service';

@Module({
  imports: [PrismaModule, PacientesModule],
  controllers: [PlanosAlimentaresController],
  providers: [PlanosAlimentaresService],
  exports: [PlanosAlimentaresService],
})
export class PlanosAlimentaresModule {}
