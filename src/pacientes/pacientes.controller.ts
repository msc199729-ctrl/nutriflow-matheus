import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PacientesService } from './pacientes.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { CreatePacienteDto } from './dto/create-paciente.dto';
import { UpdatePacienteDto } from './dto/update-paciente.dto';
import { CreateNotaClinicaDto } from './dto/create-nota-clinica.dto';

const PACIENTE_FOTO_DIR = join(process.cwd(), 'uploads', 'paciente-perfil');

const pacienteFotoStorage = diskStorage({
  destination: PACIENTE_FOTO_DIR,
  filename: (_req, file, cb) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = extname(file.originalname) || '.jpg';
    cb(null, `perfil-${suffix}${ext}`);
  },
});

@ApiTags('Pacientes')
@ApiBearerAuth('access-token')
@Controller('pacientes')
export class PacientesController {
  constructor(private readonly pacientesService: PacientesService) {}

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista paginada de pacientes do nutricionista' })
  findAll(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    if (
      user.perfil !== 'nutricionista' &&
      user.perfil !== 'admin_clinica'
    ) {
      throw new ForbiddenException(
        'Apenas nutricionista ou gestor da clínica pode listar pacientes.',
      );
    }
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.pacientesService.findAll(user, pageNum, limitNum);
  }

  @Get(':id/notas-clinicas')
  @ApiResponse({ status: 200, description: 'Lista de notas clínicas do paciente' })
  @ApiQuery({ name: 'tipo', required: false, description: 'Filtrar por tipo (consulta, exame, orientacao, atestado, recibo)' })
  listNotasClinicas(
    @Param('id', ParseIntPipe) idPaciente: number,
    @Query('tipo') tipo: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.listNotasClinicas(idPaciente, user, tipo);
  }

  @Post(':id/notas-clinicas')
  @ApiResponse({ status: 201, description: 'Nota criada' })
  createNotaClinica(
    @Param('id', ParseIntPipe) idPaciente: number,
    @Body() dto: CreateNotaClinicaDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.createNotaClinica(idPaciente, dto, user);
  }

  @Delete(':id/notas-clinicas/:notaId')
  @ApiResponse({ status: 200, description: 'Nota removida' })
  removeNotaClinica(
    @Param('id', ParseIntPipe) idPaciente: number,
    @Param('notaId', ParseIntPipe) notaId: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.removeNotaClinica(idPaciente, notaId, user);
  }

  @Post(':id/foto-perfil')
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: pacienteFotoStorage,
      limits: { fileSize: 4 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /image\/(jpeg|png|gif|webp)/.test(file.mimetype);
        cb(null, !!ok);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { foto: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Foto de perfil atualizada' })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou ausente' })
  async uploadFotoPerfil(
    @Param('id', ParseIntPipe) idPaciente: number,
    @CurrentUser() user: JwtPayloadUser,
    @UploadedFile()
    file?: { path?: string; mimetype?: string; size?: number; originalname?: string },
  ) {
    if (!file?.path) {
      throw new BadRequestException('Envie uma imagem (JPEG, PNG, GIF ou WebP).');
    }
    return this.pacientesService.updateFotoPerfilFromUpload(idPaciente, user, file.path);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Paciente encontrado' })
  @ApiResponse({ status: 404, description: 'Paciente não encontrado' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.findOne(id, user);
  }

  @Post()
  @ApiResponse({ status: 201, description: 'Paciente criado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'E-mail já cadastrado' })
  create(
    @Body() dto: CreatePacienteDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    if (
      user.perfil !== 'nutricionista' &&
      user.perfil !== 'admin_clinica'
    ) {
      throw new ForbiddenException(
        'Apenas nutricionista ou gestor da clínica pode criar pacientes.',
      );
    }
    return this.pacientesService.create(dto, user);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Paciente atualizado' })
  @ApiResponse({ status: 404, description: 'Paciente não encontrado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePacienteDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Paciente removido' })
  @ApiResponse({ status: 404, description: 'Paciente não encontrado' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.remove(id, user);
  }
}
