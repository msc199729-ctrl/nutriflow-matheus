import { Module } from '@nestjs/common';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { DailyLogsController } from './daily-logs.controller';
import { DailyLogsService } from './daily-logs.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'registros');

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

@Module({
  controllers: [DailyLogsController],
  providers: [DailyLogsService],
  exports: [DailyLogsService],
})
export class DailyLogsModule {}
