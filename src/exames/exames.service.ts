import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId, isAdminSistema } from '../common/tenant/tenant-scope';
import { CreateExameDto, ItemExameDto, UpdateExameDto } from './dto/exame.dto';

/** Situação de um item frente à faixa de referência do laudo. */
type SituacaoItem = 'baixo' | 'normal' | 'alto' | 'sem_referencia' | 'sem_valor';

@Injectable()
export class ExamesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensurePacienteAccess(idPaciente: number, user: JwtPayloadUser) {
    if (isAdminSistema(user)) return;
    const wid = requireWorkspaceId(user);
    const paciente = await this.prisma.paciente.findFirst({
      where: {
        id: idPaciente,
        workspaceId: wid,
        ...(user.perfil === PerfilUsuario.nutricionista
          ? { idNutricionista: user.sub }
          : {}),
      },
      select: { id: true },
    });
    if (!paciente) {
      throw new ForbiddenException('Paciente não vinculado a você');
    }
  }

  private async ensureExameAccess(id: number, user: JwtPayloadUser) {
    const exame = await this.prisma.exameLaboratorial.findUnique({
      where: { id },
      select: { id: true, idPaciente: true },
    });
    if (!exame) throw new NotFoundException('Exame não encontrado');
    await this.ensurePacienteAccess(exame.idPaciente, user);
    return exame;
  }

  /**
   * Classifica o item frente à faixa de referência.
   *
   * A referência vem do laudo, não de uma tabela fixa: cada laboratório usa a
   * sua. Sem referência informada o item fica sem classificação — melhor não
   * dizer nada do que dizer errado.
   */
  private situacao(item: {
    valor: number | null;
    referenciaMin: number | null;
    referenciaMax: number | null;
  }): SituacaoItem {
    if (item.valor == null) return 'sem_valor';
    if (item.referenciaMin == null && item.referenciaMax == null) {
      return 'sem_referencia';
    }
    if (item.referenciaMin != null && item.valor < item.referenciaMin) {
      return 'baixo';
    }
    if (item.referenciaMax != null && item.valor > item.referenciaMax) {
      return 'alto';
    }
    return 'normal';
  }

  private mapItem(i: {
    id: number;
    nome: string;
    valor: number | null;
    unidade: string | null;
    referenciaMin: number | null;
    referenciaMax: number | null;
    resultadoTexto: string | null;
  }) {
    return {
      id: i.id,
      nome: i.nome,
      valor: i.valor,
      unidade: i.unidade,
      referenciaMin: i.referenciaMin,
      referenciaMax: i.referenciaMax,
      resultadoTexto: i.resultadoTexto,
      situacao: this.situacao(i),
    };
  }

  private mapExame(e: {
    id: number;
    idPaciente: number;
    dataColeta: Date;
    laboratorio: string | null;
    observacoes: string | null;
    criadoEm: Date;
    itens: Array<{
      id: number;
      nome: string;
      valor: number | null;
      unidade: string | null;
      referenciaMin: number | null;
      referenciaMax: number | null;
      resultadoTexto: string | null;
    }>;
  }) {
    const itens = e.itens.map((i) => this.mapItem(i));
    return {
      id: e.id,
      idPaciente: e.idPaciente,
      dataColeta: e.dataColeta.toISOString().slice(0, 10),
      laboratorio: e.laboratorio,
      observacoes: e.observacoes,
      criadoEm: e.criadoEm.toISOString(),
      itens,
      resumo: {
        total: itens.length,
        alterados: itens.filter(
          (i) => i.situacao === 'baixo' || i.situacao === 'alto',
        ).length,
      },
    };
  }

  /** Normaliza o nome do biomarcador para agrupar entre coletas. */
  private limparItens(itens: ItemExameDto[]) {
    const limpos = itens
      .map((i) => ({
        nome: i.nome.trim(),
        valor: i.valor ?? null,
        unidade: i.unidade?.trim() || null,
        referenciaMin: i.referenciaMin ?? null,
        referenciaMax: i.referenciaMax ?? null,
        resultadoTexto: i.resultadoTexto?.trim() || null,
      }))
      .filter((i) => i.nome.length > 0);

    if (limpos.length === 0) {
      throw new BadRequestException('Informe ao menos um item no exame.');
    }
    return limpos;
  }

  async create(idPaciente: number, dto: CreateExameDto, user: JwtPayloadUser) {
    await this.ensurePacienteAccess(idPaciente, user);
    const itens = this.limparItens(dto.itens);

    const exame = await this.prisma.exameLaboratorial.create({
      data: {
        idPaciente,
        dataColeta: new Date(`${dto.dataColeta}T00:00:00.000Z`),
        laboratorio: dto.laboratorio?.trim() || null,
        observacoes: dto.observacoes?.trim() || null,
        itens: { create: itens },
      },
      include: { itens: { orderBy: { nome: 'asc' } } },
    });
    return this.mapExame(exame);
  }

  async findAll(idPaciente: number, user: JwtPayloadUser) {
    await this.ensurePacienteAccess(idPaciente, user);
    const exames = await this.prisma.exameLaboratorial.findMany({
      where: { idPaciente },
      orderBy: { dataColeta: 'desc' },
      include: { itens: { orderBy: { nome: 'asc' } } },
    });
    return exames.map((e) => this.mapExame(e));
  }

  async findOne(id: number, user: JwtPayloadUser) {
    await this.ensureExameAccess(id, user);
    const exame = await this.prisma.exameLaboratorial.findUnique({
      where: { id },
      include: { itens: { orderBy: { nome: 'asc' } } },
    });
    return this.mapExame(exame!);
  }

  async update(id: number, dto: UpdateExameDto, user: JwtPayloadUser) {
    await this.ensureExameAccess(id, user);

    const data: Record<string, unknown> = {};
    if (dto.dataColeta !== undefined) {
      data.dataColeta = new Date(`${dto.dataColeta}T00:00:00.000Z`);
    }
    if (dto.laboratorio !== undefined) {
      data.laboratorio = dto.laboratorio?.trim() || null;
    }
    if (dto.observacoes !== undefined) {
      data.observacoes = dto.observacoes?.trim() || null;
    }

    // Itens: substitui a lista inteira quando enviada (mais simples de raciocinar
    // do que diff item a item, e o formulário manda tudo).
    if (dto.itens !== undefined) {
      const itens = this.limparItens(dto.itens);
      await this.prisma.$transaction([
        this.prisma.itemExame.deleteMany({ where: { idExame: id } }),
        this.prisma.exameLaboratorial.update({
          where: { id },
          data: { ...data, itens: { create: itens } },
        }),
      ]);
    } else {
      await this.prisma.exameLaboratorial.update({ where: { id }, data });
    }

    return this.findOne(id, user);
  }

  async remove(id: number, user: JwtPayloadUser) {
    await this.ensureExameAccess(id, user);
    await this.prisma.exameLaboratorial.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Comparativo do MESMO biomarcador entre coletas.
   *
   * É o motivo de se olhar exame em consulta de retorno: ver se a ferritina
   * subiu desde janeiro. Texto livre não permitia isso.
   */
  async comparativo(idPaciente: number, user: JwtPayloadUser, nomes?: string[]) {
    await this.ensurePacienteAccess(idPaciente, user);

    const exames = await this.prisma.exameLaboratorial.findMany({
      where: { idPaciente },
      orderBy: { dataColeta: 'asc' },
      include: { itens: true },
    });

    if (exames.length === 0) return { pacienteId: idPaciente, biomarcadores: [] };

    // chave = nome normalizado (minúsculo, sem acento, sem espaço extra)
    const normalizar = (n: string) =>
      n
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const listaNomes = nomes?.map(normalizar);

    const mapa = new Map<
      string,
      {
        nome: string;
        unidade: string | null;
        referenciaMin: number | null;
        referenciaMax: number | null;
        serie: Array<{ data: string; valor: number | null; situacao: SituacaoItem }>;
      }
    >();

    for (const exame of exames) {
      const dataIso = exame.dataColeta.toISOString().slice(0, 10);
      for (const item of exame.itens) {
        const chave = normalizar(item.nome);
        if (listaNomes && listaNomes.length > 0 && !listaNomes.includes(chave)) {
          continue;
        }
        const atual = mapa.get(chave) ?? {
          nome: item.nome,
          unidade: item.unidade,
          referenciaMin: item.referenciaMin,
          referenciaMax: item.referenciaMax,
          serie: [],
        };
        atual.serie.push({
          data: dataIso,
          valor: item.valor,
          situacao: this.situacao(item),
        });
        mapa.set(chave, atual);
      }
    }

    const biomarcadores = [...mapa.values()]
      // Só interessa o que foi medido em 2+ coletas: um ponto não é evolução.
      .filter((b) => b.serie.length >= 2)
      .map((b) => {
        const comValor = b.serie.filter((p) => p.valor != null);
        const primeiro = comValor[0];
        const ultimo = comValor[comValor.length - 1];
        const delta =
          primeiro && ultimo
            ? (ultimo.valor as number) - (primeiro.valor as number)
            : null;
        return {
          ...b,
          delta,
          variacaoPercentual:
            delta != null && primeiro?.valor
              ? Math.round((delta / (primeiro.valor as number)) * 1000) / 10
              : null,
          /** true quando saiu de fora da faixa para dentro. */
          melhorou: this.avaliarMelhora(b.serie),
        };
      })
      .sort((a, b) => b.serie.length - a.serie.length);

    return { pacienteId: idPaciente, biomarcadores };
  }

  /**
   * Melhora = última medição está dentro da faixa e a primeira não estava.
   * Só considera itens com referência — sem faixa, não há como julgar.
   */
  private avaliarMelhora(
    serie: Array<{ valor: number | null; situacao: SituacaoItem }>,
  ): boolean | null {
    const relevantes = serie.filter(
      (p) => p.situacao !== 'sem_referencia' && p.situacao !== 'sem_valor',
    );
    if (relevantes.length < 2) return null;
    const primeira = relevantes[0];
    const ultima = relevantes[relevantes.length - 1];
    if (ultima.situacao === 'normal') return primeira.situacao !== 'normal';
    if (primeira.situacao === 'normal') return false;
    return null;
  }
}
