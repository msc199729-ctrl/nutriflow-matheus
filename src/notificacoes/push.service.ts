import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Push notification para o app do paciente.
 *
 * Acesso por SQL direto, igual a `NotificacoesService`: o build n\u00e3o depende de
 * `prisma generate` com o schema novo, e a tabela vem da migra\u00e7\u00e3o
 * `20261127210000_add_dispositivo_push`.
 *
 * Por que existe: o app chama `POST /notifications/device-token` desde o fork e
 * recebia 404 \u2014 o token nunca era gravado e o push nunca sa\u00eda. Como o aviso
 * j\u00e1 nasce no banco (tabela `notificacoes`), o push \u00e9 o sino: se falhar, o
 * paciente ainda v\u00ea o item na caixa de entrada ao abrir o app.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  private static readonly ENDPOINT = 'https://exp.host/--/api/v2/push/send';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grava (ou reatribui) o token do aparelho ao paciente logado.
   *
   * O token \u00e9 \u00fanico: o mesmo aparelho trocando de conta passa a receber os
   * avisos do novo paciente, e o token n\u00e3o fica \u00f3rf\u00e3o apontando para o
   * anterior \u2014 o que faria um paciente receber aviso do outro.
   */
  async registrar(
    idPaciente: number,
    token: string,
    plataforma?: string | null,
  ): Promise<{ id: number; token: string }> {
    const limpo = token.trim();
    const linhas = await this.prisma.$queryRaw<Array<{ id: number; token: string }>>`
      INSERT INTO "dispositivos_push" ("id_paciente", "token", "plataforma")
      VALUES (${idPaciente}, ${limpo}, ${plataforma ?? null})
      ON CONFLICT ("token") DO UPDATE
        SET "id_paciente" = EXCLUDED."id_paciente",
            "plataforma" = COALESCE(EXCLUDED."plataforma", "dispositivos_push"."plataforma"),
            "atualizado_em" = NOW()
      RETURNING "id", "token"
    `;
    return linhas[0];
  }

  /**
   * Remove um token. Sem `idPaciente`, remove de qualquer dono \u2014 usos: logout no
   * app, e token que a Expo disse n\u00e3o existir mais (`DeviceNotRegistered`).
   */
  async remover(token: string, idPaciente?: number): Promise<{ removidos: number }> {
    const linhas = await this.prisma.$executeRaw`
      DELETE FROM "dispositivos_push"
       WHERE "token" = ${token.trim()}
         AND (${idPaciente ?? null}::int IS NULL OR "id_paciente" = ${idPaciente ?? null}::int)
    `;
    return { removidos: Number(linhas) };
  }

  /**
   * Envia um aviso para todos os aparelhos do paciente.
   *
   * NUNCA lan\u00e7a: avisar n\u00e3o pode desfazer o que o nutricionista fez. Se a Expo
   * recusar um token porque o app foi desinstalado, o token \u00e9 apagado na hora \u2014
   * sen\u00e3o a lista cresce com aparelhos que nunca v\u00e3o receber nada.
   */
  async enviarParaPaciente(
    idPaciente: number,
    aviso: { titulo: string; mensagem: string; dados?: Record<string, unknown> },
  ): Promise<void> {
    try {
      const tokens = await this.prisma.$queryRaw<Array<{ token: string }>>`
        SELECT "token" FROM "dispositivos_push" WHERE "id_paciente" = ${idPaciente}
      `;
      if (tokens.length === 0) return;

      const mensagens = tokens.map((t) => ({
        to: t.token,
        title: aviso.titulo,
        body: aviso.mensagem,
        sound: 'default',
        data: aviso.dados ?? {},
      }));

      const resposta = await fetch(PushService.ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mensagens),
        signal: AbortSignal.timeout(8000),
      });

      if (!resposta.ok) {
        this.logger.warn(
          `Expo Push respondeu ${resposta.status} para o paciente ${idPaciente}`,
        );
        return;
      }

      const corpo = (await resposta.json()) as {
        data?: Array<{ status: string; details?: { error?: string } }>;
      };
      const recusados = (corpo.data ?? [])
        .map((r, i) => ({ r, token: tokens[i]?.token }))
        .filter(
          ({ r, token }) =>
            token != null &&
            r.status === 'error' &&
            r.details?.error === 'DeviceNotRegistered',
        );

      for (const { token } of recusados) {
        await this.remover(token!);
      }
      if (recusados.length > 0) {
        this.logger.log(
          `${recusados.length} token(s) de aparelho desinstalado removido(s)`,
        );
      }
    } catch (erro) {
      this.logger.error(
        `Falha ao enviar push para o paciente ${idPaciente}: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }
}
