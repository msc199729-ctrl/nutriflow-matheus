import type { PrismaClient } from '@prisma/client';
import { isPlanoSaasValido, type PlanoSaasCode } from './saas-billing.util';

/** Limite de pacientes (plano Clínica = total no workspace; demais = por nutricionista). */
export const SAAS_LIMITE_PACIENTES: Record<PlanoSaasCode, number> = {
  basico: 20,
  profissional: 80,
  clinica: 300,
};

/** Ações de IA por mês civil (UTC): resumo clínico e demais gerações gravadas em `analises_ia`. */
export const SAAS_LIMITE_IA_ACOES_MES: Record<PlanoSaasCode, number> = {
  basico: 0,
  profissional: 40,
  clinica: 200,
};

export function normalizarPlanoSaas(codigo: string | null | undefined): PlanoSaasCode {
  if (codigo && isPlanoSaasValido(codigo)) return codigo;
  return 'basico';
}

export function planoPermiteGeracaoIa(plano: PlanoSaasCode): boolean {
  return SAAS_LIMITE_IA_ACOES_MES[plano] > 0;
}

export function inicioMesUtc(ref: Date = new Date()): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function inicioProximoMesUtc(ref: Date = new Date()): Date {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  if (m === 11) return new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0));
  return new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
}

export async function countPacientesPorPlano(
  prisma: Pick<PrismaClient, 'paciente'>,
  opts: { workspaceId: number; plano: PlanoSaasCode; idNutricionista: number },
): Promise<number> {
  if (opts.plano === 'clinica') {
    return prisma.paciente.count({ where: { workspaceId: opts.workspaceId } });
  }
  return prisma.paciente.count({
    where: {
      workspaceId: opts.workspaceId,
      idNutricionista: opts.idNutricionista,
    },
  });
}

export async function countAnalisesIaUsoMes(
  prisma: Pick<PrismaClient, 'analiseIa'>,
  opts: { workspaceId: number; plano: PlanoSaasCode; idNutricionista: number },
): Promise<number> {
  const start = inicioMesUtc();
  const end = inicioProximoMesUtc();
  const criadoEm = { gte: start, lt: end };
  if (opts.plano === 'clinica') {
    return prisma.analiseIa.count({
      where: {
        criadoEm,
        paciente: { workspaceId: opts.workspaceId },
      },
    });
  }
  return prisma.analiseIa.count({
    where: {
      criadoEm,
      paciente: {
        workspaceId: opts.workspaceId,
        idNutricionista: opts.idNutricionista,
      },
    },
  });
}
