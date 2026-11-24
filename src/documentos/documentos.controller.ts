import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { DocumentosService } from './documentos.service';
import { AtestadoDto, DocumentoLivreDto, ReciboDto } from './documentos.dto';

@Controller('documentos')
@UseGuards(JwtAuthGuard)
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

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
}