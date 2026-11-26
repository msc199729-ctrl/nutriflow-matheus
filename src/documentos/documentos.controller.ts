import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { DocumentosService } from './documentos.service';
import { PlanoPdfService } from './plano-pdf.service';
import { ProfissionalService } from './profissional.service';
import { AtestadoDto, DocumentoLivreDto, ReciboDto } from './documentos.dto';
import { AtualizarPerfilProfissionalDto } from './perfil-profissional.dto';

/** Pasta do logo do timbre (fora de `src`, servida por /uploads). */
const TIMBRE_DIR = join(process.cwd(), 'uploads', 'timbre');
mkdirSync(TIMBRE_DIR, { recursive: true });

const timbreStorage = diskStorage({
  destination: (_req, _file, cb) => cb(null, TIMBRE_DIR),
  filename: (req, file, cb) => {
    const id = (req as unknown as { user?: JwtPayloadUser }).user;
    const dono = id?.idNutricionista ?? id?.sub ?? 'conta';
    const ext = (extname(file.originalname) || '.png').toLowerCase();
    cb(null, `logo-${dono}-${Date.now()}${ext}`);
  },
});

@Controller('documentos')
@UseGuards(JwtAuthGuard)
export class DocumentosController {
  constructor(
    private readonly documentosService: DocumentosService,
    private readonly planoPdfService: PlanoPdfService,
    private readonly profissionalService: ProfissionalService,
  ) {}

  // ── Timbre: dados que aparecem em todo documento desta conta ──

  @Get('perfil-profissional')
  perfilProfissional(@CurrentUser() user: JwtPayloadUser) {
    return this.profissionalService.perfilParaEdicao(user);
  }

  @Patch('perfil-profissional')
  atualizarPerfilProfissional(
    @Body() dto: AtualizarPerfilProfissionalDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.profissionalService.atualizar(user, dto);
  }

  @Post('perfil-profissional/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: timbreStorage,
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        cb(null, /image\/(png|jpeg|webp|svg\+xml)/.test(file.mimetype));
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Logo do timbre atualizado' })
  @ApiResponse({ status: 400, description: 'Arquivo inválido ou ausente' })
  async uploadLogo(
    @CurrentUser() user: JwtPayloadUser,
    @UploadedFile() file?: { path?: string },
  ) {
    if (!file?.path) {
      throw new BadRequestException('Envie uma imagem (PNG, JPEG, WebP ou SVG).');
    }
    const relativo = file.path
      .replace(process.cwd(), '')
      .replace(/^[\\/]+/, '')
      .replace(/\\/g, '/');
    return this.profissionalService.salvarLogo(user, relativo);
  }

  @Delete('perfil-profissional/logo')
  removerLogo(@CurrentUser() user: JwtPayloadUser) {
    return this.profissionalService.removerLogo(user);
  }

  @Get('modelos')
  modelos() {
    return this.documentosService.listarModelos();
  }

  private enviar(pdf: PDFKit.PDFDocument, res: Response, nome: string) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
    pdf.pipe(res);
  }

  @Post('atestado')
  async atestado(
    @Body() dto: AtestadoDto,
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
  ) {
    this.enviar(await this.documentosService.gerarAtestado(dto, user), res, 'atestado.pdf');
  }

  @Post('recibo')
  async recibo(
    @Body() dto: ReciboDto,
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
  ) {
    this.enviar(await this.documentosService.gerarRecibo(dto, user), res, 'recibo.pdf');
  }

  @Post('livre')
  async livre(
    @Body() dto: DocumentoLivreDto,
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
  ) {
    this.enviar(await this.documentosService.gerarLivre(dto, user), res, 'documento.pdf');
  }

  /**
   * PDF timbrado do plano alimentar — entrega ao paciente.
   * Nome do arquivo sanitizado (sem caracteres problemáticos).
   */
  @Get('plano-alimentar/:idPlano/pdf')
  async planoAlimentar(
    @Param('idPlano', ParseIntPipe) idPlano: number,
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
  ) {
    const dados = await this.planoPdfService.carregarPlano(idPlano, user);
    const slug = dados.nomePlano
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60);
    const nome = `plano-alimentar-${slug || idPlano}.pdf`;
    this.enviar(this.planoPdfService.gerar(dados), res, nome);
  }
}
