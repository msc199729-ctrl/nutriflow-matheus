/**
 * Dados do profissional que assinam os documentos — lidos da CONTA LOGADA,
 * nunca fixos no código. Cada nutricionista que usa o sistema emite os
 * documentos com o próprio timbre.
 *
 * O model `Nutricionista` já tinha `nome`, `crn` e `tipoConselho`. Faltam nele:
 *   - `especialidade`  (ex.: "Nutricionista Clínico Esportivo")
 *   - `cidade`         (usada na data da assinatura)
 *   - `logoUrl`        (caminho do upload em /uploads/timbre/)
 *   - `instagram`      (opcional, aparece no rodapé)
 *
 * Ver migração `add_timbre_nutricionista` — até ela rodar, os campos novos
 * chegam como `undefined` e os documentos continuam saindo (sem eles).
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

/** Campos do Nutricionista que interessam ao timbre. */
const SELECT_TIMBRE = {
  id: true,
  nome: true,
  crn: true,
  tipoConselho: true,
  especialidade: true,
  cidade: true,
  logoUrl: true,
  instagram: true,
} as const;

/** Fallbacks usados só quando a conta ainda não preencheu o perfil. */
const PADRAO = {
  nome: 'Nutricionista',
  especialidade: 'Nutrição Clínica',
  conselhoTipo: 'CRN',
  conselhoNumero: '—',
  cidade: '',
};

/**
 * Alguns documentos (atestado, recibo, documento livre) ainda aceitam os
 * dados do profissional vindos do FORMULÁRIO, para o caso de outro
 * profissional assinar o documento. Quando o formulário não manda, vale a
 * conta logada.
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
   * Perfil do profissional logado. Lança 404 se a conta não tiver registro de
   * nutricionista (ex.: admin_sistema tentando emitir documento de paciente).
   */
  async doUsuario(
    user: JwtPayloadUser,
    preenchidoPeloFormulario: ProfissionalDoFormulario = {},
  ): Promise<PerfilProfissional> {
    const id = this.idDoUsuario(user);
    const n = await this.prisma.nutricionista.findUnique({
      where: { id },
      select: SELECT_TIMBRE,
    });

    if (!n) {
      throw new NotFoundException(
        'Perfil de nutricionista não encontrado para esta conta. ' +
          'Preencha seus dados profissionais antes de emitir documentos.',
      );
    }

    const conselhoTipo = n.tipoConselho === 'crm' ? 'CRM' : 'CRN';

    return {
      nome: preenchidoPeloFormulario.nutricionistaNome?.trim() || n.nome?.trim() || PADRAO.nome,
      especialidade:
        preenchidoPeloFormulario.nutricionistaEspecialidade?.trim() ||
        n.especialidade?.trim() ||
        PADRAO.especialidade,
      conselhoTipo:
        preenchidoPeloFormulario.conselhoTipo?.trim().toUpperCase() || conselhoTipo,
      conselhoNumero:
        preenchidoPeloFormulario.conselhoNumero?.trim() || n.crn?.trim() || PADRAO.conselhoNumero,
      cidade: preenchidoPeloFormulario.cidade?.trim() || n.cidade?.trim() || PADRAO.cidade,
      logoUrl: n.logoUrl ?? null,
      instagram: n.instagram ?? null,
    };
  }

  /** Perfil cru para a tela de configurações (não usa o DTO de documentos). */
  async perfilParaEdicao(user: JwtPayloadUser) {
    const id = this.idDoUsuario(user);
    const n = await this.prisma.nutricionista.findUnique({
      where: { id },
      select: SELECT_TIMBRE,
    });
    if (!n) {
      throw new NotFoundException('Perfil de nutricionista não encontrado para esta conta.');
    }
    return {
      id: n.id,
      nome: n.nome ?? '',
      especialidade: n.especialidade ?? '',
      conselhoTipo: n.tipoConselho === 'crm' ? 'CRM' : 'CRN',
      conselhoNumero: n.crn ?? '',
      cidade: n.cidade ?? '',
      logoUrl: n.logoUrl ?? null,
      instagram: n.instagram ?? '',
      logoUrlPublica: urlPublicaLogo(n.logoUrl),
    };
  }

  async atualizar(user: JwtPayloadUser, dto: AtualizarPerfilProfissionalDto) {
    const id = this.idDoUsuario(user);
    await this.prisma.nutricionista.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined && { nome: dto.nome.trim() }),
        ...(dto.especialidade !== undefined && {
          especialidade: dto.especialidade.trim(),
        }),
        ...(dto.crn !== undefined && { crn: dto.crn.trim() }),
        ...(dto.tipoConselho !== undefined && {
          tipoConselho: dto.tipoConselho.toLowerCase() === 'crm' ? 'crm' : 'crn',
        }),
        ...(dto.cidade !== undefined && { cidade: dto.cidade.trim() }),
        ...(dto.instagram !== undefined && { instagram: dto.instagram.trim() }),
      },
    });
    return this.perfilParaEdicao(user);
  }

  /** Guarda o caminho do logo enviado pelo multer. */
  async salvarLogo(user: JwtPayloadUser, caminhoRelativo: string) {
    const id = this.idDoUsuario(user);
    await this.prisma.nutricionista.update({
      where: { id },
      data: { logoUrl: caminhoRelativo },
    });
    return this.perfilParaEdicao(user);
  }

  async removerLogo(user: JwtPayloadUser) {
    const id = this.idDoUsuario(user);
    await this.prisma.nutricionista.update({
      where: { id },
      data: { logoUrl: null },
    });
    return this.perfilParaEdicao(user);
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
