import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
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
  @ApiResponse({ status: 200, description: 'Registros do dia e total de água (ml)' })
  findByDay(
    @Query('data') dataStr: string | undefined,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.dailyLogsService.findByDay(user, dataStr);
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
    @UploadedFile() file?: { path?: string },
  ) {
    const urlFotoPrato = file?.path ?? undefined;
    return this.dailyLogsService.create(dto, user, urlFotoPrato);
  }
}
