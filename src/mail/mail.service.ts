import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { join } from 'path';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  buildNutricionistaContaAprovadaHtml,
  buildNutricionistaContaAprovadaText,
} from './templates/nutricionista-conta-aprovada.template';

const LOGO_CID = 'onutri-logo';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  /** SMTP configurado (host + remetente). */
  isConfigured(): boolean {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from = this.config.get<string>('MAIL_FROM')?.trim();
    return Boolean(host && from);
  }

  private getTransporter(): Transporter | null {
    if (!this.isConfigured()) return null;
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('SMTP_HOST')!.trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const secureEnv = this.config.get<string>('SMTP_SECURE')?.toLowerCase();
    const secure =
      secureEnv === 'true' || secureEnv === '1' || port === 465;

    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth:
        user && pass
          ? { user, pass }
          : user
            ? { user, pass: pass ?? '' }
            : undefined,
    });
    return this.transporter;
  }

  /** Caminho do PNG da marca (build + dev). */
  private resolveLogoPath(): string | null {
    const file = 'onutri.png';
    const distPath = join(__dirname, 'assets', file);
    const srcPath = join(process.cwd(), 'src', 'mail', 'assets', file);
    if (existsSync(distPath)) return distPath;
    if (existsSync(srcPath)) return srcPath;
    this.logger.warn(`Arquivo de logo não encontrado (${file}). E-mail será enviado sem imagem inline.`);
    return null;
  }

  private getAppName(): string {
    return this.config.get<string>('MAIL_APP_NAME')?.trim() || 'ONutri';
  }

  private getLoginUrl(): string {
    const explicit = this.config.get<string>('MAIL_APP_URL')?.trim();
    if (explicit) return explicit;
    const base = this.config.get<string>('MAIL_APP_BASE_URL')?.trim();
    if (base) return `${base.replace(/\/$/, '')}/auth/login`;
    return 'http://localhost:3001/auth/login';
  }

  /**
   * Notifica o nutricionista quando a conta for aprovada (contaAtiva true).
   * Falhas de envio são apenas logadas — a operação de negócio já foi concluída.
   */
  async sendNutricionistaContaAprovada(params: {
    to: string;
    nomeNutricionista: string | null;
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.debug('SMTP não configurado (SMTP_HOST / MAIL_FROM). E-mail de aprovação não enviado.');
      return;
    }

    const transporter = this.getTransporter();
    if (!transporter) return;

    const appName = this.getAppName();
    const loginUrl = this.getLoginUrl();
    const nomeExibicao =
      params.nomeNutricionista?.trim() || params.to.split('@')[0] || 'Nutricionista';

    const logoPath = this.resolveLogoPath();
    const attachments = logoPath
      ? [
          {
            filename: 'onutri.png',
            path: logoPath,
            cid: LOGO_CID,
          },
        ]
      : [];

    const from = this.config.get<string>('MAIL_FROM')!.trim();
    const subject = `${appName} — sua conta foi aprovada`;

    const html = buildNutricionistaContaAprovadaHtml({
      nomeExibicao,
      loginUrl,
      appName,
      ...(logoPath ? { logoCid: LOGO_CID } : {}),
    });

    const text = buildNutricionistaContaAprovadaText({
      nomeExibicao,
      loginUrl,
      appName,
    });

    try {
      await transporter.sendMail({
        from,
        to: params.to,
        subject,
        text,
        html,
        attachments,
      });
      this.logger.log(`E-mail de conta aprovada enviado para ${params.to}`);
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar e-mail de aprovação para ${params.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
