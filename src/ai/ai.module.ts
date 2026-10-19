import { Module } from '@nestjs/common';
import { FormulariosModule } from '../formularios/formularios.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenAIService } from './openai.service';

@Module({
  imports: [FormulariosModule],
  controllers: [AiController],
  providers: [AiService, OpenAIService],
  exports: [AiService, OpenAIService],
})
export class AiModule {}
