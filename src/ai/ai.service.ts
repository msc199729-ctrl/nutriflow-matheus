import { ForbiddenException, Injectable } from '@nestjs/common';
import { PerfilUsuario, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import {
  countAnalisesIaUsoMes,
  normalizarPlanoSaas,
  planoPermiteGeracaoIa,
  SAAS_LIMITE_IA_ACOES_MES,
} from '../common/saas-plans.util';
import {
  isAdminSistema,
  requireWorkspaceId,
} from '../common/tenant/tenant-scope';
import { FormulariosService } from '../formularios/formularios.service';
import { OpenAIService } from './openai.service';

const TIPO_ANALISE_RESUMO_CLINICO = 'resumo_clinico';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formulariosService: FormulariosService,
    private readonly openAi: OpenAIService,
  ) {}

  private async ensurePacienteAccess(idPaciente: number, user: JwtPayloadUser) {
    if (isAdminSistema(user)) return;
    if (user.perfil === PerfilUsuario.paciente && user.sub === idPaciente) return;
    const wid = requireWorkspaceId(user);
    const paciente = await this.prisma.paciente.findFirst({
      where: {
        id: idPaciente,
        workspaceId: wid,
        ...(user.perfil === PerfilUsuario.nutricionista
          ? { idNutricionista: user.sub }
          : {}),
      },
    });
    if (!paciente) throw new ForbiddenException('Paciente não encontrado ou sem permissão');
  }

  async findAllAnalises(user: JwtPayloadUser) {
    if (user.perfil === PerfilUsuario.paciente) {
      return this.prisma.analiseIa.findMany({
        where: { idPaciente: user.sub },
        include: { paciente: { select: { nome: true } } },
        orderBy: { criadoEm: 'desc' },
        take: 50,
      });
    }
    if (isAdminSistema(user)) {
      return this.prisma.analiseIa.findMany({
        include: { paciente: { select: { nome: true, id: true } } },
        orderBy: { criadoEm: 'desc' },
        take: 100,
      });
    }
    const wid = requireWorkspaceId(user);
    if (user.perfil === PerfilUsuario.nutricionista) {
      const plano = normalizarPlanoSaas(user.planoSaas);
      if (!planoPermiteGeracaoIa(plano)) {
        return [];
      }
      return this.prisma.analiseIa.findMany({
        where: { paciente: { workspaceId: wid, idNutricionista: user.sub } },
        include: { paciente: { select: { nome: true, id: true } } },
        orderBy: { criadoEm: 'desc' },
        take: 50,
      });
    }
    if (user.perfil === PerfilUsuario.admin_clinica) {
      return this.prisma.analiseIa.findMany({
        where: { paciente: { workspaceId: wid } },
        include: { paciente: { select: { nome: true, id: true } } },
        orderBy: { criadoEm: 'desc' },
        take: 50,
      });
    }
    return [];
  }

  async gerarResumoClinico(idPaciente: number, user: JwtPayloadUser) {
    await this.ensurePacienteAccess(idPaciente, user);

    if (!isAdminSistema(user)) {
      if (user.perfil === PerfilUsuario.paciente) {
        throw new ForbiddenException('Geração de resumo clínico não disponível para este perfil.');
      }
      const pacienteRow = await this.prisma.paciente.findFirst({
        where: { id: idPaciente },
        select: { idNutricionista: true, workspaceId: true },
      });
      if (!pacienteRow) {
        throw new ForbiddenException('Paciente não encontrado ou sem permissão');
      }
      const nutDono = await this.prisma.nutricionista.findUnique({
        where: { id: pacienteRow.idNutricionista },
        select: { planoSaas: true },
      });
      const plano = normalizarPlanoSaas(nutDono?.planoSaas);
      if (!planoPermiteGeracaoIa(plano)) {
        throw new ForbiddenException(
          'IA não está disponível no plano Essencial do nutricionista responsável. Atualize o plano para Profissional ou Clínica.',
        );
      }
      const usado = await countAnalisesIaUsoMes(this.prisma, {
        workspaceId: pacienteRow.workspaceId,
        plano,
        idNutricionista: pacienteRow.idNutricionista,
      });
      const limite = SAAS_LIMITE_IA_ACOES_MES[plano];
      if (usado >= limite) {
        throw new ForbiddenException(
          `Limite mensal de ações de IA atingido (${limite}) para este plano. Tente no próximo mês civil ou fale com o suporte.`,
        );
      }
    }

    const textoRespostas =
      await this.formulariosService.getRespostasFormatadasParaPaciente(idPaciente);

    const systemPrompt = `Você é um assistente de análise clínica nutricional. Com base nas respostas dos formulários do paciente, elabore um resumo clínico objetivo e um JSON estruturado.
Retorne um único bloco de texto com duas seções separadas por "---JSON---":
1) Resumo em texto livre (até 3 parágrafos), em português.
2) Após a linha "---JSON---", um único objeto JSON com as chaves: "resumo" (string com o mesmo resumo), "pontos_atencao" (array de strings com pontos de atenção), "recomendacoes" (array de strings).`;

    const userPrompt = `Respostas dos formulários do paciente (cronológico):\n\n${textoRespostas}\n\nElabore o resumo clínico e o JSON conforme instruções.`;

    const snapshotPrompt = `${systemPrompt}\n\n${userPrompt}`;
    let respostaBruta: string;
    let dadosEstruturados: Record<string, unknown> | null = null;

    try {
      respostaBruta = await this.openAi.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      const jsonPart = respostaBruta.split('---JSON---')[1]?.trim();
      if (jsonPart) {
        try {
          dadosEstruturados = JSON.parse(jsonPart) as Record<string, unknown>;
        } catch {
          dadosEstruturados = { resumo_texto: respostaBruta };
        }
      } else {
        dadosEstruturados = { resumo_texto: respostaBruta };
      }
    } catch (err) {
      respostaBruta = err instanceof Error ? err.message : String(err);
    }

    const analise = await this.prisma.analiseIa.create({
      data: {
        idPaciente,
        criadoEm: new Date(),
        tipoAnalise: TIPO_ANALISE_RESUMO_CLINICO,
        snapshotPrompt,
        respostaBruta,
        dadosEstruturados: (dadosEstruturados ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return analise;
  }
}
