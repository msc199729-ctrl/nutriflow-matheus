import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PerfilUsuario, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { isAdminSistema, requireWorkspaceId } from '../common/tenant/tenant-scope';

/** Validade padrão do link enviado ao paciente (dias). */
const DIAS_VALIDADE_PADRAO = 30;

export interface LinkPublicoFormulario {
  idEnvio: number;
  token: string;
  expiraEm: string;
  expiraEmDias: number;
}

@Injectable()
export class FormulariosPublicoService {
  constructor(private readonly prisma: PrismaService) {}

  private get segredo(): string {
    return (
      process.env.FORMULARIO_PUBLICO_SECRET ??
      process.env.JWT_SECRET ??
      'default-secret-change-me'
    );
  }

  private assinar(payload: string): string {
    return createHmac('sha256', this.segredo)
      .update(payload)
      .digest('base64url')
      .slice(0, 32);
  }

  /** Token sem estado: `<idEnvio>.<expEpoch>.<hmac>` — não precisa de coluna nova. */
  private gerarToken(idEnvio: number, dias: number): LinkPublicoFormulario {
    const exp = Math.floor(Date.now() / 1000) + dias * 86400;
    const payload = `${idEnvio}.${exp}`;
    return {
      idEnvio,
      token: `${payload}.${this.assinar(payload)}`,
      expiraEm: new Date(exp * 1000).toISOString(),
      expiraEmDias: dias,
    };
  }

  private validarToken(token: string): number {
    const partes = (token ?? '').split('.');
    if (partes.length !== 3) {
      throw new BadRequestException('Link inválido');
    }
    const [idStr, expStr, mac] = partes;
    const idEnvio = Number.parseInt(idStr, 10);
    const exp = Number.parseInt(expStr, 10);
    if (!Number.isFinite(idEnvio) || idEnvio <= 0 || !Number.isFinite(exp)) {
      throw new BadRequestException('Link inválido');
    }
    const esperado = this.assinar(`${idEnvio}.${exp}`);
    const recebido = mac;
    if (
      esperado.length !== recebido.length ||
      !timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido))
    ) {
      throw new UnauthorizedException('Link inválido');
    }
    if (Math.floor(Date.now() / 1000) > exp) {
      throw new GoneException('Este link expirou. Peça um novo ao seu nutricionista.');
    }
    return idEnvio;
  }

  /**
   * Link para o nutri copiar/enviar. Chamado autenticado; o envio precisa existir
   * e o profissional já foi checado no fluxo normal (rota exige JWT).
   */
  async gerarLink(
    idEnvio: number,
    dias = DIAS_VALIDADE_PADRAO,
    user?: JwtPayloadUser,
  ): Promise<LinkPublicoFormulario> {
    const envio = await this.prisma.envioFormulario.findUnique({
      where: { id: idEnvio },
      select: {
        id: true,
        paciente: { select: { idNutricionista: true, workspaceId: true } },
      },
    });
    if (!envio) throw new NotFoundException('Envio não encontrado');
    // O token dá acesso às respostas: só quem atende o paciente pode gerá-lo.
    if (user && !isAdminSistema(user)) {
      const wid = requireWorkspaceId(user);
      if (envio.paciente.workspaceId !== wid) {
        throw new ForbiddenException('Acesso negado a este envio');
      }
      if (
        user.perfil === PerfilUsuario.nutricionista &&
        envio.paciente.idNutricionista !== user.sub
      ) {
        throw new ForbiddenException('Acesso negado a este envio');
      }
    }
    return this.gerarToken(idEnvio, dias);
  }

  /** Dados que o paciente vê ao abrir o link — sem login. */
  async getPublico(token: string) {
    const idEnvio = this.validarToken(token);
    const envio = await this.prisma.envioFormulario.findUnique({
      where: { id: idEnvio },
      include: {
        modelo: { include: { perguntas: { orderBy: { id: 'asc' } } } },
        paciente: { select: { id: true, nome: true } },
        respostas: { select: { idPergunta: true, valorResposta: true } },
      },
    });
    if (!envio) throw new NotFoundException('Formulário não encontrado');

    return {
      idEnvio: envio.id,
      titulo: envio.modelo.titulo ?? 'Formulário',
      pacienteNome: this.primeiroNome(envio.paciente.nome),
      enviadoEm: envio.enviadoEm,
      respondidoEm: envio.respondidoEm,
      status: envio.status,
      perguntas: envio.modelo.perguntas.map((p) => ({
        id: p.id,
        textoPergunta: p.textoPergunta,
        tipoResposta: p.tipoResposta,
        opcoes: this.parseOpcoes(p.opcoesJson),
        obrigatoria: p.obrigatoria,
      })),
      respostas: envio.respostas.map((r) => ({
        idPergunta: r.idPergunta,
        valorResposta: r.valorResposta,
      })),
    };
  }

  /** Respostas enviadas pelo paciente pelo link público. */
  async submitPublico(
    token: string,
    respostas: Array<{ idPergunta: number; valorResposta?: string }>,
  ) {
    const idEnvio = this.validarToken(token);
    const envio = await this.prisma.envioFormulario.findUnique({
      where: { id: idEnvio },
      include: { modelo: { include: { perguntas: true } } },
    });
    if (!envio) throw new NotFoundException('Formulário não encontrado');

    const perguntas = new Map(envio.modelo.perguntas.map((p) => [p.id, p]));
    const porPergunta = new Map<number, string>();
    for (const r of respostas ?? []) {
      if (!perguntas.has(r.idPergunta)) {
        throw new BadRequestException(
          `A pergunta ${r.idPergunta} não pertence a este formulário`,
        );
      }
      const valor = (r.valorResposta ?? '').trim();
      if (valor !== '') porPergunta.set(r.idPergunta, valor);
    }

    const faltando = envio.modelo.perguntas.filter(
      (p) => p.obrigatoria && !porPergunta.has(p.id),
    );
    if (faltando.length > 0) {
      throw new BadRequestException(
        `Responda as perguntas obrigatórias: ${faltando
          .map((p) => p.textoPergunta ?? `#${p.id}`)
          .join('; ')}`,
      );
    }

    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.resposta.deleteMany({ where: { idEnvio } }),
      ...(porPergunta.size > 0
        ? [
            this.prisma.resposta.createMany({
              data: [...porPergunta.entries()].map(([idPergunta, valorResposta]) => ({
                idEnvio,
                idPergunta,
                valorResposta,
              })),
            }),
          ]
        : []),
      this.prisma.envioFormulario.update({
        where: { id: idEnvio },
        data: {
          // mantém a data da primeira resposta; reenvio não reescreve o histórico
          respondidoEm: envio.respondidoEm ?? agora,
          status: 'respondido',
        },
      }),
    ]);

    return { ok: true, idEnvio, respondidoEm: envio.respondidoEm ?? agora };
  }

  private primeiroNome(nome: string | null): string | null {
    const t = nome?.trim();
    if (!t) return null;
    return t.split(/\s+/)[0];
  }

  private parseOpcoes(raw: Prisma.JsonValue | null): string[] | null {
    if (raw == null) return null;
    if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
      return raw as string[];
    }
    return null;
  }
}
