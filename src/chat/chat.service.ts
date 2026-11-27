import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

export interface ConversaResumo {
  id: number;
  idPaciente: number;
  idNutricionista: number;
  atualizadoEm: Date;
  naoLidas: number;
  paciente: { id: number; nome: string | null; urlFotoPerfil: string | null } | null;
  nutricionista: { id: number; nome: string | null } | null;
  mensagens: Array<{
    id: number;
    texto: string;
    criadoEm: Date;
    autorUsuarioId: number;
  }>;
}

interface ConversaLinha {
  id: number;
  idPaciente: number;
  idNutricionista: number;
  atualizadoEm: Date;
  pacienteNome: string | null;
  pacienteFoto: string | null;
  nutricionistaNome: string | null;
}

/**
 * Chat paciente <-> nutricionista.
 *
 * O painel web (aba Chat) e o app do paciente j\u00e1 chamavam estas rotas e
 * recebiam 404 \u2014 o m\u00f3dulo nunca existiu no backend. O contrato abaixo \u00e9 o que
 * as duas telas j\u00e1 esperam (`chatService` no painel, `services/chat.ts` no app):
 *
 *   GET    /chat/conversas                              lista de quem pede
 *   POST   /chat/conversas           { idPaciente }     nutricionista abre
 *   POST   /chat/conversas/me                           paciente abre a dele
 *   GET    /chat/conversas/:id/mensagens?cursor=
 *   POST   /chat/conversas/:id/mensagens { texto }
 *   PATCH  /chat/conversas/:id/lida
 *
 * Acesso por SQL direto (`$queryRaw`), como `NotificacoesService` e o timbre:
 * o build n\u00e3o depende de `prisma generate` ter rodado com o schema novo. As
 * tabelas v\u00eam da migra\u00e7\u00e3o `20261127210100_add_chat_conversas`; se ela n\u00e3o
 * rodou, as rotas d\u00e3o erro do banco \u2014 e \u00e9 isso que se quer ver, n\u00e3o uma
 * tela vazia mentindo que n\u00e3o h\u00e1 conversa.
 *
 * Regra de acesso: nutricionista s\u00f3 conversa com paciente dele no mesmo
 * workspace; paciente s\u00f3 com o pr\u00f3prio nutricionista.
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /** Quando quem pede \u00e9 o paciente: o nutricionista dele. */
  private async nutricionistaDoPaciente(idPaciente: number): Promise<number> {
    const linhas = await this.prisma.$queryRaw<Array<{ idNutricionista: number }>>`
      SELECT "id_nutricionista" AS "idNutricionista" FROM "pacientes" WHERE "id" = ${idPaciente} LIMIT 1
    `;
    if (linhas.length === 0) throw new NotFoundException('Paciente n\u00e3o encontrado.');
    return linhas[0].idNutricionista;
  }

  /** O par (paciente, nutricionista) da conversa de quem est\u00e1 logado. */
  private async resolverPar(
    user: JwtPayloadUser,
    dto: { idPaciente?: number },
  ): Promise<{ idPaciente: number; idNutricionista: number }> {
    if (user.perfil === 'paciente') {
      if (dto.idPaciente != null && dto.idPaciente !== user.sub) {
        throw new ForbiddenException('Acesso negado.');
      }
      return {
        idPaciente: user.sub,
        idNutricionista: await this.nutricionistaDoPaciente(user.sub),
      };
    }

    if (user.perfil !== 'nutricionista' && user.perfil !== 'admin_clinica') {
      throw new ForbiddenException('Perfil sem acesso ao chat.');
    }
    if (dto.idPaciente == null) {
      throw new BadRequestException('Informe o paciente da conversa.');
    }

    const linhas = await this.prisma.$queryRaw<
      Array<{ id: number; idNutricionista: number }>
    >`
      SELECT "id", "id_nutricionista" AS "idNutricionista"
        FROM "pacientes"
       WHERE "id" = ${dto.idPaciente}
         AND (${user.workspaceId ?? null}::int IS NULL OR "id_workspace" = ${user.workspaceId ?? null}::int)
         AND (${user.perfil === 'nutricionista' ? user.sub : null}::int IS NULL
              OR "id_nutricionista" = ${user.perfil === 'nutricionista' ? user.sub : null}::int)
       LIMIT 1
    `;
    if (linhas.length === 0) throw new NotFoundException('Paciente n\u00e3o encontrado.');
    return {
      idPaciente: linhas[0].id,
      idNutricionista: linhas[0].idNutricionista,
    };
  }

  /** Cria se n\u00e3o existe e devolve a conversa do par. Nunca duplica. */
  private async garantirConversa(par: {
    idPaciente: number;
    idNutricionista: number;
  }) {
    const linhas = await this.prisma.$queryRaw<Array<ConversaLinha>>`
      INSERT INTO "conversas" ("id_paciente", "id_nutricionista")
      VALUES (${par.idPaciente}, ${par.idNutricionista})
      ON CONFLICT ("id_paciente", "id_nutricionista") DO UPDATE
        SET "atualizado_em" = "conversas"."atualizado_em"
      RETURNING "id",
                "id_paciente" AS "idPaciente",
                "id_nutricionista" AS "idNutricionista",
                "atualizado_em" AS "atualizadoEm",
                NULL::text AS "pacienteNome",
                NULL::text AS "pacienteFoto",
                NULL::text AS "nutricionistaNome"
    `;
    const c = linhas[0];
    return {
      id: c.id,
      idPaciente: c.idPaciente,
      idNutricionista: c.idNutricionista,
      atualizadoEm: c.atualizadoEm,
    };
  }

  /** 404 (e n\u00e3o 403) para conversa de outro: n\u00e3o confirma que ela existe. */
  private async conversaDoUsuario(idConversa: number, user: JwtPayloadUser) {
    const linhas = await this.prisma.$queryRaw<
      Array<{ id: number; idPaciente: number; idNutricionista: number }>
    >`
      SELECT "id", "id_paciente" AS "idPaciente", "id_nutricionista" AS "idNutricionista"
        FROM "conversas" WHERE "id" = ${idConversa} LIMIT 1
    `;
    if (linhas.length === 0) throw new NotFoundException('Conversa n\u00e3o encontrada.');
    const c = linhas[0];

    const autorizado =
      (user.perfil === 'paciente' && c.idPaciente === user.sub) ||
      (user.perfil === 'nutricionista' && c.idNutricionista === user.sub) ||
      user.perfil === 'admin_clinica';
    if (!autorizado) throw new NotFoundException('Conversa n\u00e3o encontrada.');
    return c;
  }

  async listar(user: JwtPayloadUser): Promise<ConversaResumo[]> {
    if (
      user.perfil !== 'paciente' &&
      user.perfil !== 'nutricionista' &&
      user.perfil !== 'admin_clinica'
    ) {
      return [];
    }

    // Uma consulta s\u00f3 com a \u00faltima mensagem e a contagem de n\u00e3o lidas do ponto
    // de vista de quem pede \u2014 a mensagem do outro lado \u00e9 a "n\u00e3o lida".
    const linhas = await this.prisma.$queryRaw<Array<ConversaLinha & {
      naoLidas: bigint;
      ultimoTexto: string | null;
      ultimoCriadoEm: Date | null;
      ultimoId: number | null;
      ultimoAutor: number | null;
    }>>`
      SELECT c."id",
             c."id_paciente" AS "idPaciente",
             c."id_nutricionista" AS "idNutricionista",
             c."atualizado_em" AS "atualizadoEm",
             p."nome" AS "pacienteNome",
             p."url_foto_perfil" AS "pacienteFoto",
             n."nome" AS "nutricionistaNome",
             COUNT(m.id) FILTER (
               WHERE m."lida_em" IS NULL AND m."autor_usuario_id" <> ${user.sub}
             )::bigint AS "naoLidas",
             (SELECT m2."texto" FROM "mensagens" m2
               WHERE m2."id_conversa" = c."id" ORDER BY m2."id" DESC LIMIT 1) AS "ultimoTexto",
             (SELECT m2."criado_em" FROM "mensagens" m2
               WHERE m2."id_conversa" = c."id" ORDER BY m2."id" DESC LIMIT 1) AS "ultimoCriadoEm",
             (SELECT m2."id" FROM "mensagens" m2
               WHERE m2."id_conversa" = c."id" ORDER BY m2."id" DESC LIMIT 1) AS "ultimoId",
             (SELECT m2."autor_usuario_id" FROM "mensagens" m2
               WHERE m2."id_conversa" = c."id" ORDER BY m2."id" DESC LIMIT 1) AS "ultimoAutor"
        FROM "conversas" c
        JOIN "pacientes" p ON p."id" = c."id_paciente"
        JOIN "nutricionistas" n ON n."id" = c."id_nutricionista"
        LEFT JOIN "mensagens" m ON m."id_conversa" = c."id"
       WHERE (${user.perfil === 'paciente' ? user.sub : null}::int IS NULL
              OR c."id_paciente" = ${user.perfil === 'paciente' ? user.sub : null}::int)
         AND (${user.perfil === 'nutricionista' ? user.sub : null}::int IS NULL
              OR c."id_nutricionista" = ${user.perfil === 'nutricionista' ? user.sub : null}::int)
         AND (${user.perfil === 'admin_clinica' ? (user.workspaceId ?? null) : null}::int IS NULL
              OR p."id_workspace" = ${user.perfil === 'admin_clinica' ? (user.workspaceId ?? null) : null}::int)
       GROUP BY c."id", p."nome", p."url_foto_perfil", n."nome"
       ORDER BY c."atualizado_em" DESC
       LIMIT 50
    `;

    return linhas.map((l) => ({
      id: l.id,
      idPaciente: l.idPaciente,
      idNutricionista: l.idNutricionista,
      atualizadoEm: l.atualizadoEm,
      naoLidas: Number(l.naoLidas ?? 0),
      paciente:
        user.perfil === 'paciente'
          ? null
          : { id: l.idPaciente, nome: l.pacienteNome, urlFotoPerfil: l.pacienteFoto },
      nutricionista:
        user.perfil === 'paciente' ? { id: l.idNutricionista, nome: l.nutricionistaNome } : null,
      mensagens:
        l.ultimoId != null
          ? [
              {
                id: l.ultimoId,
                texto: l.ultimoTexto ?? '',
                criadoEm: l.ultimoCriadoEm ?? l.atualizadoEm,
                autorUsuarioId: l.ultimoAutor ?? l.idPaciente,
              },
            ]
          : [],
    }));
  }

  /** Abre (ou recupera) a conversa entre quem pede e o outro lado. */
  async abrir(user: JwtPayloadUser, dto: { idPaciente?: number }) {
    const par = await this.resolverPar(user, dto);
    return this.garantirConversa(par);
  }

  /**
   * Mensagens, mais novas primeiro e paginadas por `cursor` (id da mais antiga
   * que a tela j\u00e1 tem). As duas telas invertem para exibir.
   */
  async mensagens(idConversa: number, user: JwtPayloadUser, cursor?: number) {
    await this.conversaDoUsuario(idConversa, user);
    const c = cursor != null && Number.isFinite(cursor) ? cursor : null;
    return this.prisma.$queryRaw<
      Array<{
        id: number;
        idConversa: number;
        autorUsuarioId: number;
        texto: string;
        lidaEm: Date | null;
        criadoEm: Date;
      }>
    >`
      SELECT "id", "id_conversa" AS "idConversa", "autor_usuario_id" AS "autorUsuarioId",
             "texto", "lida_em" AS "lidaEm", "criado_em" AS "criadoEm"
        FROM "mensagens"
       WHERE "id_conversa" = ${idConversa}
         AND (${c}::int IS NULL OR "id" < ${c}::int)
       ORDER BY "id" DESC
       LIMIT 50
    `;
  }

  /**
   * Envia mensagem. `atualizado_em` da conversa sobe junto porque \u00e9 por ele que
   * as duas caixas de entrada ordenam.
   */
  async enviar(idConversa: number, texto: string, user: JwtPayloadUser) {
    const limpo = texto.trim();
    if (!limpo) throw new BadRequestException('Mensagem vazia.');
    if (limpo.length > 4000) {
      throw new BadRequestException('Mensagem muito longa (m\u00e1ximo 4000 caracteres).');
    }
    await this.conversaDoUsuario(idConversa, user);

    const linhas = await this.prisma.$queryRaw<
      Array<{
        id: number;
        idConversa: number;
        autorUsuarioId: number;
        texto: string;
        lidaEm: Date | null;
        criadoEm: Date;
      }>
    >`
      INSERT INTO "mensagens" ("id_conversa", "autor_usuario_id", "texto")
      VALUES (${idConversa}, ${user.sub}, ${limpo})
      RETURNING "id", "id_conversa" AS "idConversa", "autor_usuario_id" AS "autorUsuarioId",
                "texto", "lida_em" AS "lidaEm", "criado_em" AS "criadoEm"
    `;
    await this.prisma.$executeRaw`
      UPDATE "conversas" SET "atualizado_em" = NOW() WHERE "id" = ${idConversa}
    `;
    return linhas[0];
  }

  /** Marca como lidas as mensagens que o outro lado enviou. Idempotente. */
  async marcarLida(idConversa: number, user: JwtPayloadUser) {
    await this.conversaDoUsuario(idConversa, user);
    const atualizadas = await this.prisma.$executeRaw`
      UPDATE "mensagens"
         SET "lida_em" = COALESCE("lida_em", NOW())
       WHERE "id_conversa" = ${idConversa}
         AND "lida_em" IS NULL
         AND "autor_usuario_id" <> ${user.sub}
    `;
    return { updated: Number(atualizadas) };
  }
}
