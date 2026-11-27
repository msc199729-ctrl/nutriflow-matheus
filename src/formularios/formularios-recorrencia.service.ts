import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StatusConsulta } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService, TipoNotificacao } from '../notificacoes/notificacoes.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { isAdminSistema, requireWorkspaceId } from '../common/tenant/tenant-scope';

const APP_TIME_ZONE = 'America/Sao_Paulo';
/** Janela de acompanhamento: sem consulta nem resposta nesse período, o paciente não está ativo. */
const DIAS_ATIVO = 90;
const DIA_MS = 86_400_000;

export interface PrevisaoRecorrencia {
  idModelo: number;
  titulo: string | null;
  frequenciaDias: number;
  totalPacientes: number;
  proximos: Array<{
    idPaciente: number;
    nome: string | null;
    ultimoEnvioEm: string | null;
    respondido: boolean;
    venceEm: string | null;
    situacao: 'a_enviar' | 'aguardando_anterior' | 'inativo';
  }>;
}

/**
 * Recorrência do check-in.
 *
 * O campo `frequenciaDias` existia no schema, no DTO e na tela desde o começo e
 * nenhum `@Cron` foi escrito no projeto: o check-in nunca voltava sozinho, que é
 * justamente o que fazia o LiveClin valer a pena. Este serviço fecha esse buraco.
 *
 * Três regras que evitam os estragos clássicos de automação de mensagem:
 *  - **Só modelo com frequência explícita.** `frequenciaDias` nulo = desligado.
 *    Nada de inventar "semanal" e começar a mandar sem o nutricionista pedir.
 *  - **Nunca empilha.** Se o envio anterior ainda não foi respondido, não cria
 *    outro: dois check-ins abertos viram ruído e o paciente responde nenhum.
 *  - **Só paciente em acompanhamento.** Consulta ou resposta nos últimos 90
 *    dias (mesma régua do dashboard). Sem isso, a automação manda check-in para
 *    ex-paciente — e num acompanhamento mensal ninguém desliga isso nunca.
 */
@Injectable()
export class FormulariosRecorrenciaService {
  private readonly logger = new Logger(FormulariosRecorrenciaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** 8h de Brasília, todo dia. Grava somente o que está vencido. */
  @Cron('0 8 * * *', { timeZone: APP_TIME_ZONE, name: 'formularios-recorrencia' })
  async executar(): Promise<void> {
    try {
      const resultado = await this.processar();
      if (resultado.criados > 0) {
        this.logger.log(
          `Recorrência de check-in: ${resultado.criados} envio(s) criado(s) em ${resultado.modelos} modelo(s).`,
        );
      }
    } catch (erro) {
      // O cron não pode derrubar o processo; o erro fica no log para diagnóstico.
      this.logger.error(
        `Falha na recorrência de check-in: ${erro instanceof Error ? erro.message : String(erro)}`,
        erro instanceof Error ? erro.stack : undefined,
      );
    }
  }

  /**
   * Fonte única da decisão: usada pelo cron (grava) e pela previsão (só lê).
   * Mantém a tela e a automação dizendo a mesma coisa.
   */
  private async calcularAtrasados(filtro: {
    idModelo?: number;
    workspaceId?: number;
  } = {}) {
    const modelos = await this.prisma.modeloFormulario.findMany({
      where: {
        frequenciaDias: { not: null },
        ...(filtro.idModelo != null ? { id: filtro.idModelo } : {}),
        ...(filtro.workspaceId != null ? { workspaceId: filtro.workspaceId } : {}),
      },
      include: { perguntas: { select: { id: true } } },
      orderBy: { id: 'asc' },
    });

    const agora = Date.now();
    const limiteAtivo = new Date(agora - DIAS_ATIVO * DIA_MS);
    const saida: Array<{
      modelo: (typeof modelos)[number];
      pacientes: Array<{
        idPaciente: number;
        nome: string | null;
        ultimoEnvioEm: Date | null;
        respondido: boolean;
        venceEm: Date | null;
        situacao: 'a_enviar' | 'aguardando_anterior' | 'inativo';
      }>;
    }> = [];

    for (const modelo of modelos) {
      const frequencia = modelo.frequenciaDias ?? 0;
      // Modelo sem pergunta não é formulário; enviar criaria um link vazio.
      if (frequencia < 1 || modelo.perguntas.length === 0) continue;

      const envios = await this.prisma.envioFormulario.findMany({
        where: { idModelo: modelo.id },
        select: {
          id: true,
          idPaciente: true,
          enviadoEm: true,
          respondidoEm: true,
        },
        orderBy: { enviadoEm: 'desc' },
      });

      // Quem já recebeu este modelo é a população da recorrência — não a base
      // inteira do workspace, que incluiria gente que nunca fez check-in.
      const ultimoPorPaciente = new Map<number, (typeof envios)[number]>();
      for (const e of envios) {
        if (!ultimoPorPaciente.has(e.idPaciente)) {
          ultimoPorPaciente.set(e.idPaciente, e);
        }
      }
      if (ultimoPorPaciente.size === 0) continue;

      const ids = [...ultimoPorPaciente.keys()];
      const [consultas, respostas] = await Promise.all([
        this.prisma.consultaAgendada.findMany({
          where: {
            idPaciente: { in: ids },
            inicio: { gte: limiteAtivo },
            status: { not: StatusConsulta.cancelada },
          },
          select: { idPaciente: true },
          distinct: ['idPaciente'],
        }),
        this.prisma.envioFormulario.findMany({
          where: { idPaciente: { in: ids }, respondidoEm: { gte: limiteAtivo } },
          select: { idPaciente: true },
          distinct: ['idPaciente'],
        }),
      ]);
      const ativos = new Set<number>([
        ...consultas.map((c) => c.idPaciente),
        ...respostas.map((r) => r.idPaciente),
      ]);

      const pacientesDoModelo = await this.prisma.paciente.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true },
      });
      const nomePorId = new Map(pacientesDoModelo.map((p) => [p.id, p.nome]));

      const pacientes = ids.map((idPaciente) => {
        const ultimo = ultimoPorPaciente.get(idPaciente)!;
        const base = ultimo.enviadoEm ? ultimo.enviadoEm.getTime() : null;
        const venceEm = base != null ? new Date(base + frequencia * DIA_MS) : null;
        const respondido = ultimo.respondidoEm != null;

        let situacao: 'a_enviar' | 'aguardando_anterior' | 'inativo';
        if (!ativos.has(idPaciente)) {
          situacao = 'inativo';
        } else if (!respondido) {
          // Pendente aberto: cobrar antes de mandar outro.
          situacao = 'aguardando_anterior';
        } else if (venceEm != null && venceEm.getTime() <= agora) {
          situacao = 'a_enviar';
        } else {
          situacao = 'aguardando_anterior';
        }

        return {
          idPaciente,
          nome: nomePorId.get(idPaciente) ?? null,
          ultimoEnvioEm: ultimo.enviadoEm,
          respondido,
          venceEm,
          situacao,
        };
      });

      saida.push({ modelo, pacientes });
    }

    return saida;
  }

  /** Grava os envios vencidos. Chamado pelo cron. */
  async processar(): Promise<{ criados: number; modelos: number }> {
    const planos = await this.calcularAtrasados();
    const agora = new Date();
    let criados = 0;

    for (const plano of planos) {
      const aEnviar = plano.pacientes.filter((p) => p.situacao === 'a_enviar');
      if (aEnviar.length === 0) continue;
      const resultado = await this.prisma.envioFormulario.createMany({
        data: aEnviar.map((p) => ({
          idPaciente: p.idPaciente,
          idModelo: plano.modelo.id,
          enviadoEm: agora,
          status: 'enviado',
        })),
      });
      criados += resultado.count;

      // Sem isto o cron cria o envio no banco e o paciente nunca sabe: o
      // check-in automático só existe de verdade quando chega no app dele.
      const titulo = plano.modelo.titulo;
      for (const p of aEnviar) {
        await this.notificacoes.criar({
          idPaciente: p.idPaciente,
          tipo: TipoNotificacao.formularioEnviado,
          titulo: titulo
            ? `Novo formulário: ${titulo}`
            : 'Novo formulário de acompanhamento',
          mensagem: titulo
            ? `Seu nutricionista enviou o formulário "${titulo}". Responda por aqui mesmo, leva 2 minutos.`
            : 'Seu nutricionista enviou um formulário de acompanhamento. Responda por aqui mesmo, leva 2 minutos.',
          idReferencia: null,
        });
      }
    }

    return { criados, modelos: planos.length };
  }

  /**
   * O que o cron faria hoje, sem gravar nada. É o que a tela mostra antes de o
   * nutricionista ligar a recorrência — automação que manda sem o dono ver
   * antes não deve ser ligada às cegas.
   */
  async previsao(user: JwtPayloadUser): Promise<PrevisaoRecorrencia[]> {
    const workspaceId = isAdminSistema(user) ? undefined : requireWorkspaceId(user);
    const planos = await this.calcularAtrasados({ workspaceId });
    return planos.map((plano) => ({
      idModelo: plano.modelo.id,
      titulo: plano.modelo.titulo,
      frequenciaDias: plano.modelo.frequenciaDias ?? 0,
      totalPacientes: plano.pacientes.length,
      proximos: plano.pacientes
        .slice()
        .sort((a, b) => (a.venceEm?.getTime() ?? 0) - (b.venceEm?.getTime() ?? 0))
        .slice(0, 50)
        .map((p) => ({
          idPaciente: p.idPaciente,
          nome: p.nome,
          ultimoEnvioEm: p.ultimoEnvioEm ? p.ultimoEnvioEm.toISOString() : null,
          respondido: p.respondido,
          venceEm: p.venceEm ? p.venceEm.toISOString() : null,
          situacao: p.situacao,
        })),
    }));
  }
}
