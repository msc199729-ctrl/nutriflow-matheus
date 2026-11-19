import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AnaliseComparativoService } from "./analise-comparativo.service";
import { AnaliseComparativoController } from "./analise-comparativo.controller";

@Module({
  imports: [PrismaModule],
  controllers: [
    AnaliseComparativoController,
  ],
  providers: [
    AnaliseComparativoService,
  ],
})
export class AnaliseModule {}