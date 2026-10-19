import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PerfilUsuario, Prisma, TipoConselho } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { AdminStatsDto } from './dto/admin-stats.dto';
import type { CreateNutricionistaAdminDto } from './dto/create-nutricionista-admin.dto';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto';
import type { ListNutricionistasResponseDto } from './dto/nutricionista-list-item.dto';
import type { ListWorkspacesResponseDto } from './dto/workspace-list-item.dto';
import type { PatchNutricionistaDto } from './dto/patch-nutricionista.dto';
import { MailService } from '../mail/mail.service';
import {
  addCalendarMonth,
  clampDiaVencimentoSaas,
  isAssinaturaSaasVencida,
  isPlanoSaasValido,
  proximaDataVencimentoMensal,
  proximoVencimentoAposPagamento,
} from '../common/saas-billing.util';

/** Valor mensal por nutricionista ativo (placeholder; pode vir de config/banco depois). */
const MRR_POR_NUTRICIONISTA = 99.9;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async getStats(): Promise<AdminStatsDto> {
    const totalNutricionistas = await this.prisma.nutricionista.count();
    const mrrEstimado =
      Math.round(totalNutricionistas * MRR_POR_NUTRICIONISTA * 100) / 100;
    return { totalNutricionistas, mrrEstimado };
  }

  async listNutricionistas(
    page: number,
    limit: number,
    filters?: { busca?: string; tipoConselho?: TipoConselho },
  ): Promise<ListNutricionistasResponseDto> {
    const skip = (page - 1) * limit;
    const parts: Prisma.NutricionistaWhereInput[] = [];
    if (filters?.tipoConselho) {
      parts.push({ tipoConselho: filters.tipoConselho });
    }
    const term = filters?.busca?.trim();
    if (term) {
      parts.push({
        OR: [
          { crn: { contains: term, mode: 'insensitive' } },
          { nome: { contains: term, mode: 'insensitive' } },
          { usuario: { email: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }
    const where: Prisma.NutricionistaWhereInput =
      parts.length === 0 ? {} : parts.length === 1 ? parts[0]! : { AND: parts };

    const [items, total] = await Promise.all([
      this.prisma.nutricionista.findMany({
        where,
        skip,
        take: limit,
        include: { usuario: { include: { workspace: true } } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.nutricionista.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit) || 1;
    return {
      items: items.map((n) => {
        const prox = n.proximoVencimentoSaas;
        const wid = n.usuario.workspaceId;
        return {
          id: n.id,
          email: n.usuario.email,
          nome: n.nome,
          crn: n.crn,
          tipoConselho: n.tipoConselho,
          workspaceId: wid ?? null,
          workspaceNome: n.usuario.workspace?.nome ?? '—',
          nomeClinicaCadastro: n.nomeClinicaCadastro ?? null,
          cnpjClinicaCadastro: n.cnpjClinicaCadastro ?? null,
          statusAssinatura: n.usuario.workspace?.statusAssinatura ?? null,
          bloqueado: n.usuario.bloqueado,
          contaAtiva: n.usuario.contaAtiva,
          criadoEm: n.usuario.criadoEm,
          planoSaas: n.planoSaas ?? null,
          diaVencimentoSaas: n.diaVencimentoSaas ?? null,
          proximoVencimentoSaas: prox ? prox.toISOString().slice(0, 10) : null,
          ultimoPagamentoSaasEm: n.ultimoPagamentoSaasEm?.toISOString() ?? null,
          assinaturaSaasEmAtraso:
            n.usuario.contaAtiva && !!prox && isAssinaturaSaasVencida(prox),
        };
      }),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async patchNutricionistaUsuario(
    id: number,
    dto: PatchNutricionistaDto,
  ): Promise<{
    id: number;
    bloqueado: boolean;
    contaAtiva: boolean;
    planoSaas: string | null;
    diaVencimentoSaas: number | null;
    proximoVencimentoSaas: string | null;
    ultimoPagamentoSaasEm: string | null;
    assinaturaSaasEmAtraso: boolean;
  }> {
    const hasUsuario =
      dto.bloqueado !== undefined ||
      dto.contaAtiva !== undefined ||
      dto.workspaceId !== undefined;
    const hasNutri =
      dto.registrarPagamentoMensalidade === true ||
      dto.planoSaas !== undefined ||
      dto.diaVencimentoSaas !== undefined ||
      dto.proximoVencimentoSaas !== undefined;
    if (!hasUsuario && !hasNutri) {
      throw new BadRequestException(
        'Informe ao menos um campo: bloqueado, contaAtiva, workspace, assinatura SaaS ou pagamento.',
      );
    }
    if (dto.planoSaas != null && !isPlanoSaasValido(dto.planoSaas)) {
      throw new BadRequestException('Plano SaaS inválido');
    }

    const initial = await this.prisma.nutricionista.findUnique({
      where: { id },
      include: { usuario: true },
    });
    if (!initial) throw new NotFoundException('Nutricionista não encontrado');

    const wasInactive = !initial.usuario.contaAtiva;

    if (dto.workspaceId !== undefined) {
      const ws = await this.prisma.workspace.findUnique({
        where: { id: dto.workspaceId },
      });
      if (!ws) {
        throw new NotFoundException('Workspace não encontrado');
      }
    }

    if (dto.contaAtiva === true && wasInactive) {
      const effectiveWorkspaceId =
        dto.workspaceId !== undefined
          ? dto.workspaceId
          : initial.usuario.workspaceId;
      if (effectiveWorkspaceId == null) {
        throw new BadRequestException(
          'Selecione o workspace (clínica) ao aprovar o cadastro público.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const nutData: Prisma.NutricionistaUpdateInput = {};
      if (dto.planoSaas !== undefined) nutData.planoSaas = dto.planoSaas;
      if (dto.diaVencimentoSaas !== undefined) {
        nutData.diaVencimentoSaas = clampDiaVencimentoSaas(dto.diaVencimentoSaas);
      }
      if (dto.proximoVencimentoSaas !== undefined) {
        nutData.proximoVencimentoSaas = new Date(dto.proximoVencimentoSaas);
      }

      if (dto.registrarPagamentoMensalidade) {
        const cur = await tx.nutricionista.findUnique({ where: { id } });
        if (!cur) throw new NotFoundException('Nutricionista não encontrado');
        const base = cur.proximoVencimentoSaas;
        const diaEf = dto.diaVencimentoSaas ?? cur.diaVencimentoSaas;
        if (!base) {
          if (diaEf == null) {
            throw new BadRequestException(
              'Defina o dia de vencimento (e plano) ou aguarde a aprovação do cadastro antes de registrar pagamento.',
            );
          }
          const primeira = proximaDataVencimentoMensal(diaEf, new Date());
          nutData.proximoVencimentoSaas = addCalendarMonth(primeira);
        } else {
          nutData.proximoVencimentoSaas = proximoVencimentoAposPagamento(base);
        }
        nutData.ultimoPagamentoSaasEm = new Date();
      }

      if (Object.keys(nutData).length > 0) {
        await tx.nutricionista.update({ where: { id }, data: nutData });
      }

      if (hasUsuario) {
        await tx.usuario.update({
          where: { id: initial.usuario.id },
          data: {
            ...(dto.bloqueado !== undefined ? { bloqueado: dto.bloqueado } : {}),
            ...(dto.contaAtiva !== undefined ? { contaAtiva: dto.contaAtiva } : {}),
            ...(dto.workspaceId !== undefined ? { workspaceId: dto.workspaceId } : {}),
          },
        });
      }

      if (dto.contaAtiva === true && wasInactive) {
        const u = await tx.usuario.findUnique({ where: { id: initial.usuario.id } });
        const n = await tx.nutricionista.findUnique({ where: { id } });
        if (
          u?.contaAtiva &&
          n?.planoSaas &&
          n.diaVencimentoSaas != null &&
          !n.proximoVencimentoSaas
        ) {
          await tx.nutricionista.update({
            where: { id },
            data: {
              proximoVencimentoSaas: proximaDataVencimentoMensal(
                n.diaVencimentoSaas,
                new Date(),
              ),
            },
          });
        }
      }
    });

    const updatedUser = await this.prisma.usuario.findUnique({
      where: { id: initial.usuario.id },
    });
    const nutFinal = await this.prisma.nutricionista.findUnique({
      where: { id },
      include: { usuario: true },
    });
    if (!updatedUser || !nutFinal) {
      throw new NotFoundException('Nutricionista não encontrado após atualização');
    }

    const liberadoParaUso =
      dto.contaAtiva === true &&
      wasInactive &&
      updatedUser.contaAtiva &&
      !updatedUser.bloqueado;

    if (liberadoParaUso) {
      await this.mailService.sendNutricionistaContaAprovada({
        to: nutFinal.usuario.email,
        nomeNutricionista: nutFinal.nome,
      });
    } else if (dto.contaAtiva === true && wasInactive && updatedUser.bloqueado) {
      this.logger.debug(
        `Conta ${id} marcada como ativa, mas usuário bloqueado — e-mail de aprovação não enviado.`,
      );
    }

    const prox = nutFinal.proximoVencimentoSaas;
    return {
      id,
      bloqueado: updatedUser.bloqueado,
      contaAtiva: updatedUser.contaAtiva,
      planoSaas: nutFinal.planoSaas ?? null,
      diaVencimentoSaas: nutFinal.diaVencimentoSaas ?? null,
      proximoVencimentoSaas: prox ? prox.toISOString().slice(0, 10) : null,
      ultimoPagamentoSaasEm: nutFinal.ultimoPagamentoSaasEm?.toISOString() ?? null,
      assinaturaSaasEmAtraso:
        updatedUser.contaAtiva && !!prox && isAssinaturaSaasVencida(prox),
    };
  }

  async listWorkspaces(): Promise<ListWorkspacesResponseDto> {
    const items = await this.prisma.workspace.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        nome: true,
        documento: true,
        statusAssinatura: true,
        criadoEm: true,
      },
    });
    return { items };
  }

  async createWorkspace(dto: CreateWorkspaceDto) {
    return this.prisma.workspace.create({
      data: {
        nome: dto.nome.trim(),
        documento: dto.documento?.trim() || null,
        statusAssinatura: dto.statusAssinatura?.trim() || 'Ativo',
      },
    });
  }

  async createNutricionista(dto: CreateNutricionistaAdminDto) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: dto.workspaceId },
    });
    if (!ws) {
      throw new NotFoundException('Workspace não encontrado');
    }

    let planoSaas: string | null = null;
    let diaVencimentoSaas: number | null = null;
    let proximoVencimentoSaas: Date | null = null;
    if (dto.planoSaas != null && dto.diaVencimentoSaas != null) {
      if (!isPlanoSaasValido(dto.planoSaas)) {
        throw new BadRequestException('Plano SaaS inválido');
      }
      planoSaas = dto.planoSaas;
      diaVencimentoSaas = clampDiaVencimentoSaas(dto.diaVencimentoSaas);
      proximoVencimentoSaas = proximaDataVencimentoMensal(diaVencimentoSaas, new Date());
    } else if (dto.planoSaas != null || dto.diaVencimentoSaas != null) {
      throw new BadRequestException(
        'Informe `planoSaas` e `diaVencimentoSaas` juntos para agendar cobrança, ou omita ambos.',
      );
    }

    const senhaHash = await this.usersService.hashPassword(dto.senha);
    const created = await this.usersService.createUsuario({
      email: dto.email,
      senhaHash,
      perfil: PerfilUsuario.nutricionista,
      workspaceId: dto.workspaceId,
      nome: dto.nome,
      crn: dto.crn,
      tipoConselho:
        dto.tipoConselho === 'crm' ? TipoConselho.crm : TipoConselho.crn,
      planoSaas,
      diaVencimentoSaas,
      proximoVencimentoSaas,
    });
    return {
      id: created.id,
      email: created.email,
      nome: created.nutricionista?.nome ?? null,
      crn: created.nutricionista?.crn ?? null,
      tipoConselho: created.nutricionista?.tipoConselho ?? TipoConselho.crn,
      workspaceId: created.workspaceId ?? dto.workspaceId,
    };
  }
}
