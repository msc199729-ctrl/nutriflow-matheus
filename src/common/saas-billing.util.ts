import { PerfilUsuario } from '@prisma/client';
import type { UsuarioComPerfil } from '../users/users.service';

/**
 * Códigos de plano na API (controle interno / cadastro). Nomes comerciais na landing:
 * `basico` → Essencial, `profissional` → Profissional, `clinica` → Clínica / equipe.
 */
export const PLANOS_SAAS = ['basico', 'profissional', 'clinica'] as const;
export type PlanoSaasCode = (typeof PLANOS_SAAS)[number];

export const MSG_SAAS_INADIMPLENTE =
  'Acesso suspenso: mensalidade em atraso. O acesso será restabelecido após o super administrador registrar o pagamento.';

export function isPlanoSaasValido(codigo: string): codigo is PlanoSaasCode {
  return (PLANOS_SAAS as readonly string[]).includes(codigo);
}

export function clampDiaVencimentoSaas(dia: number): number {
  return Math.min(28, Math.max(1, Math.floor(dia)));
}

function utcNoon(y: number, m0: number, d: number): Date {
  return new Date(Date.UTC(y, m0, d, 12, 0, 0, 0));
}

function daysInMonthUtc(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** Comparação apenas por data civil (UTC). */
export function startOfUtcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Próxima data de vencimento a partir de `referencia` (inclusive o próprio dia, se ainda não passou).
 * Ex.: dia 10 e referência 8/mar → 10/mar; referência 12/mar → 10/abr.
 */
export function proximaDataVencimentoMensal(
  diaVencimento: number,
  referencia: Date = new Date(),
): Date {
  const d = clampDiaVencimentoSaas(diaVencimento);
  let y = referencia.getUTCFullYear();
  let m = referencia.getUTCMonth();
  const refDay = referencia.getUTCDate();
  const dim = daysInMonthUtc(y, m);
  const effective = Math.min(d, dim);
  if (effective >= refDay) {
    return utcNoon(y, m, effective);
  }
  m += 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }
  const dim2 = daysInMonthUtc(y, m);
  return utcNoon(y, m, Math.min(d, dim2));
}

/** Avança exatamente um mês civil, respeitando último dia do mês (ex.: 31 jan → 28/29 fev). */
export function addCalendarMonth(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  let nm = m + 1;
  let ny = y;
  if (nm > 11) {
    nm = 0;
    ny += 1;
  }
  const dim = daysInMonthUtc(ny, nm);
  const nd = Math.min(d, dim);
  return utcNoon(ny, nm, nd);
}

/** Vencido = hoje (UTC) é estritamente depois do dia do vencimento. */
export function isAssinaturaSaasVencida(proximoVencimento: Date | null | undefined): boolean {
  if (!proximoVencimento) return false;
  const today = startOfUtcDayMs(new Date());
  const due = startOfUtcDayMs(proximoVencimento);
  return today > due;
}

export function isNutricionistaInadimplenteSaas(user: UsuarioComPerfil): boolean {
  if (user.perfil !== PerfilUsuario.nutricionista || !user.nutricionista) return false;
  if (!user.contaAtiva) return false;
  return isAssinaturaSaasVencida(user.nutricionista.proximoVencimentoSaas);
}

/**
 * Após registrar pagamento: avança o vencimento em ciclos mensais até ficar >= hoje (UTC),
 * para desbloquear quem ficou vários meses sem pagar com uma única confirmação.
 */
export function proximoVencimentoAposPagamento(
  vencimentoAtual: Date,
  hoje: Date = new Date(),
): Date {
  let d = addCalendarMonth(vencimentoAtual);
  const t0 = startOfUtcDayMs(hoje);
  while (startOfUtcDayMs(d) < t0) {
    d = addCalendarMonth(d);
  }
  return d;
}
