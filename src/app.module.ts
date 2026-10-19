import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AiModule } from './ai/ai.module';
import { DailyLogsModule } from './daily-logs/daily-logs.module';
import { FoodsModule } from './foods/foods.module';
import { PlanosAlimentaresModule } from './planos-alimentares/planos-alimentares.module';
import { FormulariosModule } from './formularios/formularios.module';
import { PhysicalEvaluationsModule } from './physical-evaluations/physical-evaluations.module';
import { PacientesModule } from './pacientes/pacientes.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AgendamentosModule } from './agendamentos/agendamentos.module';
import { PrismaModule } from './prisma/prisma.module';
import { AnamneseModule } from './anamnese/anamnese.module';
import { FinanceiroModule } from './financeiro/financeiro.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60000, limit: 100 },
    ]),
    PrismaModule,
    AuthModule,
    AdminModule,
    PhysicalEvaluationsModule,
    PacientesModule,
    AgendamentosModule,
    DashboardModule,
    RelatoriosModule,
    FoodsModule,
    PlanosAlimentaresModule,
    FormulariosModule,
    AiModule,
    DailyLogsModule,
    AnamneseModule,
    FinanceiroModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
