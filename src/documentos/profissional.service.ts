/**
 * Dados do profissional que assinam os documentos — lidos da CONTA LOGADA,
 * nunca fixos no código. Cada nutricionista que usa o sistema emite os
 * documentos com o próprio timbre.
 *
 * `nome`, `crn` e `tipo_conselho` já existem no model `Nutricionista`.
 * Especialidade, cidade, logo e Instagram vêm da migração
 * `add_timbre_nutricionista`, que apenas ADICIONA quatro colunas opcionais.
 *
 * Por que SQL direto nos quatro campos novos: assim o backend não exige
 * `prisma generate` com schema novo para emitir documento — e, se a migração
 * ainda não rodou, a leitura cai no fallback e a emissão continua. Quando o
 * schema passar a declarar as colunas, basta trocar `extras()` por um `select`.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import type { AtualizarPerfilProfissionalDto } from './perfil-profissional.dto';

export interface PerfilProfissional {
  nome: string;
  especialidade: string;
  conselhoTipo: string;
  conselhoNumero: string;
  cidade: string;
  logoUrl: string | null;
  instagram: string | null;
}

interface TimbreExtras {
  especialidade: string | null;
  cidade: string | null;
  logoUrl: string | null;
  instagram: string | null;
}

const EXTRAS_VAZIO: TimbreExtras = {
  especialidade: null,
  cidade: null,
  logoUrl: null,
  instagram: null,
};

/** Fallbacks usados só quando a conta ainda não preencheu o perfil. */
const PADRAO = {
  nome: 'Nutricionista',
  especialidade: 'Nutrição Clínica',
  conselhoTipo: 'CRN',
  conselhoNumero: '—',
  cidade: '',
};

/**
 * Atestado, recibo e documento livre aceitam os dados do profissional vindos
 * do FORMULÁRIO (para outro profissional assinar). Quando o formulário não
 * manda, vale a conta logada.
 */
export interface ProfissionalDoFormulario {
  nutricionistaNome?: string;
  nutricionistaEspecialidade?: string;
  conselhoTipo?: string;
  conselhoNumero?: string;
  cidade?: string;
}

@Injectable()
export class ProfissionalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Id do nutricionista do usuário logado (cai em `sub` para admin). */
  idDoUsuario(user: JwtPayloadUser): number {
    return user.idNutricionista ?? user.sub;
  }

  /**
   * Os quatro campos do timbre. Devolve tudo nulo quando a migração ainda não
   * rodou — o documento sai sem eles, em vez de dar erro na cara do paciente.
   */
  private async extras(id: number): Promise<TimbreExtras> {
    try {
      const linhas = await this.prisma.$queryRaw<TimbreExtras[]>`
        SELECT especialidade,
               cidade,
               logo_url AS "logoUrl",
               instagram
          FROM nutricionistas
         WHERE id = ${id}
         LIMIT 1
      `;
      return linhas[0] ?? EXTRAS_VAZIO;
    } catch {
      return EXTRAS_VAZIO;
    }
  }

  /** Garante que a conta tem registro de nutricionista. */
  private async base(id: number) {
    const n = await this.prisma.nutricionista.findUnique({
      where: { id },
      select: { id: true, nome: true, crn: true, tipoConselho: true },
    });
    if (!n) {
      throw new NotFoundException(
        'Perfil de nutricionista não encontrado para esta conta. ' +
          'Preencha seus dados profissionais antes de emitir documentos.',
      );
    }
    return n;
  }

  /**
   * Perfil do profissional logado, já com os dados do formulário aplicados
   * por cima quando existirem.
   */
  async doUsuario(
    user: JwtPayloadUser,
    preenchidoPeloFormulario: ProfissionalDoFormulario = {},
  ): Promise<PerfilProfissional> {
    const id = this.idDoUsuario(user);
    const n = await this.base(id);
    const x = await this.extras(id);

    const conselhoTipo = n.tipoConselho === 'crm' ? 'CRM' : 'CRN';

    return {
      nome: preenchidoPeloFormulario.nutricionistaNome?.trim() || n.nome?.trim() || PADRAO.nome,
      especialidade:
        preenchidoPeloFormulario.nutricionistaEspecialidade?.trim() ||
        x.especialidade?.trim() ||
        PADRAO.especialidade,
      conselhoTipo:
        preenchidoPeloFormulario.conselhoTipo?.trim().toUpperCase() || conselhoTipo,
      conselhoNumero:
        preenchidoPeloFormulario.conselhoNumero?.trim() || n.crn?.trim() || PADRAO.conselhoNumero,
      cidade: preenchidoPeloFormulario.cidade?.trim() || x.cidade?.trim() || PADRAO.cidade,
      logoUrl: x.logoUrl ?? null,
      instagram: x.instagram ?? null,
    };
  }

  /** Perfil cru para a tela de configurações do nutricionista. */
  async perfilParaEdicao(user: JwtPayloadUser) {
    const id = this.idDoUsuario(user);
    const n = await this.base(id);
    const x = await this.extras(id);
    return {
      id: n.id,
      nome: n.nome ?? '',
      especialidade: x.especialidade ?? '',
      conselhoTipo: n.tipoConselho === 'crm' ? 'CRM' : 'CRN',
      conselhoNumero: n.crn ?? '',
      cidade: x.cidade ?? '',
      logoUrl: x.logoUrl ?? null,
      instagram: x.instagram ?? '',
      logoUrlPublica: urlPublicaLogo(x.logoUrl),
    };
  }

  async atualizar(user: JwtPayloadUser, dto: AtualizarPerfilProfissionalDto) {
    const id = this.idDoUsuario(user);
    await this.base(id);

    // Campos que já existem no model.
    if (dto.nome !== undefined || dto.crn !== undefined || dto.tipoConselho !== undefined) {
      await this.prisma.nutricionista.update({
        where: { id },
        data: {
          ...(dto.nome !== undefined && { nome: dto.nome.trim() }),
          ...(dto.crn !== undefined && { crn: dto.crn.trim() }),
          ...(dto.tipoConselho !== undefined && {
            tipoConselho: dto.tipoConselho.toLowerCase() === 'crm' ? 'crm' : 'crn',
          }),
        },
      });
    }

    // Campos do timbre (colunas da migração).
    if (
      dto.especialidade !== undefined ||
      dto.cidade !== undefined ||
      dto.instagram !== undefined
    ) {
      const atual = await this.extras(id);
      await this.gravarTimbre(id, {
        especialidade:
          dto.especialidade !== undefined ? dto.especialidade.trim() : atual.especialidade,
        cidade: dto.cidade !== undefined ? dto.cidade.trim() : atual.cidade,
        instagram: dto.instagram !== undefined ? dto.instagram.trim() : atual.instagram,
        logoUrl: atual.logoUrl,
      });
    }

    return this.perfilParaEdicao(user);
  }

  /** Guarda o caminho do logo enviado pelo multer. */
  async salvarLogo(user: JwtPayloadUser, caminhoRelativo: string) {
    const id = this.idDoUsuario(user);
    const atual = await this.extras(id);
    await this.gravarTimbre(id, { ...atual, logoUrl: caminhoRelativo });
    return this.perfilParaEdicao(user);
  }

  async removerLogo(user: JwtPayloadUser) {
    const id = this.idDoUsuario(user);
    const atual = await this.extras(id);
    await this.gravarTimbre(id, { ...atual, logoUrl: null });
    return this.perfilParaEdicao(user);
  }

  /**
   * Grava os quatro campos do timbre. Falha com mensagem clara quando a
   * migração ainda não rodou — melhor que um erro de coluna inexistente.
   */
  private async gravarTimbre(id: number, t: TimbreExtras): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE nutricionistas
           SET especialidade = ${t.especialidade},
               cidade        = ${t.cidade},
               logo_url      = ${t.logoUrl},
               instagram     = ${t.instagram}
         WHERE id = ${id}
      `;
    } catch {
      throw new NotFoundException(
        'Os campos do timbre ainda não existem no banco. ' +
          'Rode a migração 20261126120000_add_timbre_nutricionista.',
      );
    }
  }
}

/**
 * O banco guarda o caminho do upload (ex.: uploads/timbre/logo-3.png).
 * O front consome esse arquivo por /uploads/timbre/logo-3.png, servido pelo
 * express.static de main.ts.
 */
function urlPublicaLogo(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;
  const limpo = logoUrl.replace(/^uploads[\/\\]/, '').replace(/^[\/\\]+/, '');
  return `/uploads/${limpo}`;
}
