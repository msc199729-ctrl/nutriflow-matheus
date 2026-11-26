import {
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PacientesService } from './pacientes.service';
import { CreatePacienteDto } from './dto/create-paciente.dto';
import { UpdatePacienteDto } from './dto/update-paciente.dto';
import { CreateNotaClinicaDto } from './dto/create-nota-clinica.dto';
import { pacientePerfilUpload } from './paciente-perfil-upload.config';

@ApiTags('Pacientes')
@ApiBearerAuth('access-token')
@Controller('pacientes')
export class PacientesController {
  constructor(private readonly pacientesService: PacientesService) {}

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'busca',
    required: false,
    description:
      'Filtra por nome, e-mail ou celular (útil para seletores com muitos pacientes)',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de pacientes do nutricionista' })
  findAll(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('busca') busca: string | undefined,
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
    return this.pacientesService.findAll(user, pageNum, limitNum, busca);
  }

  @Get(':id/notas-clinicas')
  @ApiResponse({ status: 200, description: 'Lista de notas clínicas do paciente' })
  @ApiQuery({ name: 'tipo', required: false, description: 'Filtrar por tipo (consulta, exame, orientacao, atestado, recibo)' })
  listNotasClinicas(
    @Param('id', ParseIntPipe) id: number,
    @Query('tipo') tipo: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.listNotasClinicas(id, user, tipo);
  }

  @Post(':id/notas-clinicas')
  @ApiResponse({ status: 201, description: 'Nota clínica criada' })
  createNotaClinica(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateNotaClinicaDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.createNotaClinica(id, dto, user);
  }

  @Delete(':id/notas-clinicas/:notaId')
  @ApiResponse({ status: 200, description: 'Nota clínica removida' })
  removeNotaClinica(
    @Param('id', ParseIntPipe) id: number,
    @Param('notaId', ParseIntPipe) notaId: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.removeNotaClinica(id, notaId, user);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Paciente encontrado' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.findOne(id, user);
  }

  @Post()
  @ApiResponse({ status: 201, description: 'Paciente criado' })
  create(
    @Body() dto: CreatePacienteDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.create(dto, user);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Paciente atualizado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePacienteDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.update(id, dto, user);
  }

  @Post(':id/foto-perfil')
  @UseInterceptors(FileInterceptor('file', pacientePerfilUpload))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Foto de perfil atualizada' })
  uploadFotoPerfil(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { path: string },
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.updateFotoPerfilFromUpload(id, user, file.path);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Paciente removido' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.pacientesService.remove(id, user);
  }
}
