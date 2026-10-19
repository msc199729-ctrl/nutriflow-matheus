import { Module } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'path';
import { PacientesController } from './pacientes.controller';
import { PacientesService } from './pacientes.service';
import { UsersModule } from '../users/users.module';

const PACIENTE_FOTO_UPLOAD_DIR = join(process.cwd(), 'uploads', 'paciente-perfil');
if (!existsSync(PACIENTE_FOTO_UPLOAD_DIR)) {
  mkdirSync(PACIENTE_FOTO_UPLOAD_DIR, { recursive: true });
}

@Module({
  imports: [UsersModule],
  controllers: [PacientesController],
  providers: [PacientesService],
  exports: [PacientesService],
})
export class PacientesModule {}
