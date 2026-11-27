import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PerfilUsuario } from '@prisma/client';
import { isAdminSistema, requireWorkspaceId } from '../common/tenant/tenant-scope';

/**
 * Aviso de WhatsApp que APONTA para o app.
 *
 * Decisão de produto (Matheus, 27/11): o paciente não deve ter o trabalho de
 * abrir o WhatsApp, clicar num link e responder no navegador. O destino é o app.
 * O WhatsApp fica como sino: diz que tem coisa nova e manda para lá.
 *
 * Por isso a mensagem não leva o link do formulário — leva o endereço do app.
 * Enquanto o app do paciente não estiver publicado, o link cai no login web, e
 * é por isso que AP é configuração de ambiente e não constante: no dia em que o
 * app subir, muda a variável e nada mais.
 */
@Injectable()
export class AvisosWhatsappService {
  constructor(private readonly prisma: PrismaService) {}

  private get baseApp(): string {
    return (
      process.env.APP_PACIENTE_URL ??
      process.env.FRONTEND_URL ??
      'https://app.onutri.com.br'
    );
  }

  /** Só dígitos com DDI 55 — formato que o wa.me aceita. */
  private numeroParaWaMe(celular: string): string {
    const digitos = (celular ?? '').replace(/\D/g, '');
    if (digitos.length < 10) return '';
    return digitos.startsWith('55') ? digitos : `55${digitos}`;
  }

  private primeiroNome(nome: string | null): string {
    return (nome ?? '').trim().split(/\s+/)[0] || '';
  }

  /**
   * Texto do aviso de formulário. Curto de propósito: mensagem longa no
   * WhatsApp não é lida, e o valor está em levar ao app.
   */
  textoFormulario(pacienteNome: string | null, tituloFormulario: string | null): string {
    const nome = this.primeiroNome(pacienteNome);
    const titulo = tituloFormulario ? ` "${tituloFormulario}"` : ' semanal';
    return [
      `Oi${nome ? `, ${nome}` : ''}! 👋`,
      '',
      `Você recebeu no seu app um formulário${titulo} de acompanhamento.`,
      'É rapidinho — responde por la mesmo, direto no app, sem precisar abrir link.',
      '',
      this.baseApp,
    ].join('\n');
  }

  textoPlano(pacienteNome: string | null): string {
    const nome = this.primeiroNome(pacienteNome);
    return [
      `Oi${nome ? `, ${nome}` : ''}! 👋`,
      '',
      'Seu planejamento alimentar está disponível no seu app.',
      'Lá você vê as refeições do dia, as porções, as trocas e a lista de compras.',
      '',
      this.baseApp,
    ].join('\n');
  }

  /**
   * Monta o link wa.me pronto para o nutricionista clicar.
   *
   * Não enviamos nada automaticamente: mandar mensagem sozinho no número do
   * paciente exige a API oficial do WhatsApp Business, e disparo automático sem
   * opt-in é o caminho mais rápido para o número ser bloqueado. O botão deixa o
   * nutricionista no controle e funciona hoje.
   */
  async linkAviso(
    idPaciente: number,
    tipo: 'formulario' | 'plano',
    user: JwtPayloadUser,
    opcoes: { idEnvio?: number } = {},
  ) {
    const paciente = await this.prisma.paciente.findUnique({
      where: { id: idPaciente },
      select: { id: true, nome: true, celular: true, workspaceId: true, idNutricionista: true },
    });
    if (!paciente) return { disponivel: false, motivo: 'Paciente não encontrado' };

    if (!isAdminSistema(user)) {
      const wid = requireWorkspaceId(user);
      if (paciente.workspaceId !== wid) {
        return { disponivel: false, motivo: 'Paciente de outro workspace' };
      }
      if (
        user.perfil === PerfilUsuario.nutricionista &&
        paciente.idNutricionista !== user.sub
      ) {
        return { disponivel: false, motivo: 'Paciente de outro nutricionista' };
      }
    }

    const numero = this.numeroParaWaMe(paciente.celular ?? '');
    if (!numero) {
      return {
        disponivel: false,
        motivo: 'Paciente sem celular cadastrado',
        pacienteNome: paciente.nome,
      };
    }

    let texto: string;
    if (tipo === 'plano') {
      texto = this.textoPlano(paciente.nome);
    } else {
      let titulo: string | null = null;
      if (opcoes.idEnvio != null) {
        const envio = await this.prisma.envioFormulario.findUnique({
          where: { id: opcoes.idEnvio },
          select: { modelo: { select: { titulo: true } } },
        });
        titulo = envio?.modelo?.titulo ?? null;
      }
      texto = this.textoFormulario(paciente.nome, titulo);
    }

    return {
      disponivel: true,
      pacienteNome: paciente.nome,
      celular: paciente.celular,
      texto,
      url: `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,
    };
  }
}
