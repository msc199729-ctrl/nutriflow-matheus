import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { DocumentosService } from './documentos.service';
import { PlanoPdfService } from './plano-pdf.service';
import { AtestadoDto, DocumentoLivreDto, ReciboDto } from './documentos.dto';

@Controller('documentos')
@UseGuards(JwtAuthGuard)
export class DocumentosController {
  constructor(
    private readonly documentosService: DocumentosService,
    private readonly planoPdfService: PlanoPdfService,
  ) {}

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
