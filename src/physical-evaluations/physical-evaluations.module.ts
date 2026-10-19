import { Module } from '@nestjs/common';
import { PhysicalEvaluationsController } from './physical-evaluations.controller';
import { PhysicalEvaluationsService } from './physical-evaluations.service';

@Module({
  controllers: [PhysicalEvaluationsController],
  providers: [PhysicalEvaluationsService],
  exports: [PhysicalEvaluationsService],
})
export class PhysicalEvaluationsModule {}
