import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { memoryStorage, diskStorage } from 'multer';
import { extname, join } from 'path';
import { DailyLogsService } from './daily-logs.service';
import { CreateRegistroDiarioDto } from './dto/create-registro-diario.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'registros');

const storage = diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = extname(file.originalname) || '.jpg';
    cb(null, `prato-${suffix}${ext}`);
  },
});

@ApiTags('Registros Diários')
@ApiBearerAuth('access-token')
@Controller('registros-diarios')
export class DailyLogsController {
  constructor(private readonly dailyLogsService: DailyLogsService) {}

  @Get()
@ApiQuery({ name: 'data', required: false, description: 'Data no formato YYYY-MM-DD (padrão: hoje)' })
@ApiQuery({ name: 'idPaciente', required: false, description: 'ID do paciente (obrigatório para nutricionista/admin)' })
@ApiResponse({ status: 200, description: 'Registros do dia, total de água (ml) e meta de água' })
findByDay(
  @Query('data') dataStr: string | undefined,
  @Query('idPaciente') idPaciente: string | undefined,
  @CurrentUser() user: JwtPayloadUser,
) {
  return this.dailyLogsService.findByDay(user, dataStr, idPaciente);
}

  @Post()
  @UseInterceptors(
    FileInterceptor('foto_prato', {
      storage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = /image\/(jpeg|png|gif|webp)/.test(file.mimetype);
        cb(null, !!allowed);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        foto_prato: { type: 'string', format: 'binary' },
        idPaciente: { type: 'number' },
        tipoRefeicao: { type: 'string' },
        ingestaoAguaMl: { type: 'number' },
        horasSono: { type: 'number' },
        pesoKg: { type: 'number' },      },
    },
  })
  @ApiResponse({ status: 201, description: 'Registro criado' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })

   async create(
    @Body() dto: CreateRegistroDiarioDto,
    @CurrentUser() user: JwtPayloadUser,
    @UploadedFile() file?: { path?: string; filename?: string },
  ) {
    const urlFotoPrato = file?.filename
      ? `/uploads/registros/${file.filename}`
      : undefined;
    return this.dailyLogsService.create(dto, user, urlFotoPrato);
  }

  /**
   * Análise da foto do prato.
   *
   * Existe para o app não receber 404 e mostrar um erro de rede: a resposta diz
   * que o recurso ainda não está pronto. A foto NÃO é salva aqui — esta rota só
   * devolve a análise; quem quiser guardar a refeição chama `POST /registros-diarios`.
   *
   * A rota precisa vir declarada ANTES de `@Delete(':id')`? Não conflita (métodos
   * diferentes), mas fica junto do POST por ser a mesma família de entrada.
   */
  @Post('analisar-imagem')
  @UseInterceptors(
    FileInterceptor('foto_prato', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = /image\/(jpeg|png|gif|webp)/.test(file.mimetype);
        cb(null, !!allowed);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { foto_prato: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Análise indisponível (recurso ainda não implementado)',
  })
  @ApiResponse({ status: 400, description: 'Foto ausente ou em formato não suportado' })
  analisarImagem(
    @UploadedFile() file?: { buffer?: Buffer; mimetype?: string },
  ) {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException(
        'Envie a foto do prato no campo "foto_prato" (jpeg, png, gif ou webp).',
      );
    }
    return this.dailyLogsService.analisarImagemPrato(file.buffer);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Registro removido' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.dailyLogsService.remove(user, id);
  }
}
