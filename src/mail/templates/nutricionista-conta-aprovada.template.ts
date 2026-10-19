/** Escapa texto vindo do banco para uso seguro em HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export type NutricionistaContaAprovadaParams = {
  nomeExibicao: string;
  /** URL absoluta da tela de login (ex.: https://app.exemplo.com/auth/login). */
  loginUrl: string;
  appName: string;
  /** CID do anexo inline da logo; se omitido, o cabeçalho usa só texto. */
  logoCid?: string;
};

/**
 * HTML de e-mail transacional: conta de nutricionista aprovada.
 * Layout em tabelas para compatibilidade com clientes de e-mail.
 */
export function buildNutricionistaContaAprovadaHtml(p: NutricionistaContaAprovadaParams): string {
  const nome = escapeHtml(p.nomeExibicao);
  const login = escapeHtml(p.loginUrl);
  const app = escapeHtml(p.appName);
  const cid = p.logoCid ? escapeHtml(p.logoCid) : '';
  const headerVisual = cid
    ? `<img src="cid:${cid}" width="112" height="112" alt="${app}" style="display:block;margin:0 auto;width:112px;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<p style="margin:0;font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${app}</p>`;
  const footerLogo = cid
    ? `<img src="cid:${cid}" width="48" height="48" alt="" style="display:block;margin:0 auto 12px;width:48px;height:auto;opacity:0.85;border:0;" />`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Conta aprovada — ${app}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f766e 0%,#059669 50%,#10b981 100%);padding:28px 32px;text-align:center;">
              ${headerVisual}
              <p style="margin:16px 0 0;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.9);">${app}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;line-height:1.25;color:#0f172a;">Sua conta foi aprovada</h1>
              <p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:#475569;">
                Olá, <strong style="color:#0f172a;">${nome}</strong> — o cadastro do seu perfil profissional foi analisado e <strong style="color:#0f766e;">liberado para uso</strong>.
              </p>
              <p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:#475569;">
                Você já pode acessar o painel com o e-mail e a senha informados no cadastro e começar a cadastrar pacientes, planos e acompanhamentos.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 36px;text-align:center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(135deg,#0d9488,#059669);">
                    <a href="${login}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Entrar no painel</a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#94a3b8;">
                Se o botão não funcionar, copie e cole este endereço no navegador:<br />
                <span style="word-break:break-all;color:#64748b;">${login}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;background-color:#f8fafc;text-align:center;">
              ${footerLogo}
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
                Mensagem automática do ${app}. Em caso de dúvida, responda ao administrador da sua clínica ou ao suporte da plataforma.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildNutricionistaContaAprovadaText(
  p: Pick<NutricionistaContaAprovadaParams, 'nomeExibicao' | 'loginUrl' | 'appName'>,
): string {
  return [
    `${p.appName} — Conta aprovada`,
    '',
    `Olá, ${p.nomeExibicao},`,
    '',
    'Seu cadastro de nutricionista foi aprovado. Você já pode acessar o painel com seu e-mail e senha.',
    '',
    `Acesse: ${p.loginUrl}`,
    '',
    'Este é um e-mail automático; não é necessário responder.',
  ].join('\n');
}
