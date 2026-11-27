import { Module } from '@nestjs/common';
import { AguaController } from './agua.controller';
import { AguaService } from './agua.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AguaController],
  providers: [AguaService],
  exports: [AguaService],
})
export class AguaModule {}
