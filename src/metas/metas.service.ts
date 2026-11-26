import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../common/tenant/tenant-scope';
import { CreateMetaDto } from './dto/create-meta.dto';
import { UpdateMetaDto } from './dto/update-meta.dto';

@Injectable()
export class MetasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMetaDto, user: JwtPayloadUser, idPaciente: number) {
    await this.assertAcesso(user, idPaciente);
    return this.prisma.meta.create({
      data: {
        idPaciente,
        titulo: dto.titulo,
        tipo: dto.tipo,
        valorAlvo: dto.valorAlvo,
        valorAtual: dto.valorAtual ?? null,
        unidade: dto.unidade,
        prazo: dto.prazo ? new Date(dto.prazo) : null,
      },
    });
  }

  async findAll(user: JwtPayloadUser, idPaciente: number) {
    await this.assertAcesso(user, idPaciente);
    return this.prisma.meta.findMany({ where: { idPaciente }, orderBy: { criadoEm: 'desc' } });
  }

  /**
   * Atualização parcial — o uso principal é registrar o progresso
   * (`valorAtual`) sem reescrever a meta inteira.
   */
  async update(
    user: JwtPayloadUser,
    idPaciente: number,
    id: number,
    dto: UpdateMetaDto,
  ) {
    await this.assertAcesso(user, idPaciente);
    const meta = await this.prisma.meta.findUnique({ where: { id } });
    if (!meta || meta.idPaciente !== idPaciente) {
      throw new NotFoundException('Meta não encontrada');
    }

    const data: Record<string, unknown> = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.valorAlvo !== undefined) data.valorAlvo = dto.valorAlvo;
    if (dto.valorAtual !== undefined) data.valorAtual = dto.valorAtual;
    if (dto.unidade !== undefined) data.unidade = dto.unidade;
    if (dto.prazo !== undefined) data.prazo = dto.prazo ? new Date(dto.prazo) : null;
    if (dto.concluida !== undefined) data.concluida = dto.concluida;

    return this.prisma.meta.update({ where: { id }, data });
  }

  async toggle(user: JwtPayloadUser, idPaciente: number, id: number) {
    await this.assertAcesso(user, idPaciente);
    const meta = await this.prisma.meta.findUnique({ where: { id } });
    if (!meta || meta.idPaciente !== idPaciente) throw new NotFoundException('Meta não encontrada');
    return this.prisma.meta.update({ where: { id }, data: { concluida: !meta.concluida } });
  }

  async remove(user: JwtPayloadUser, idPaciente: number, id: number) {
    await this.assertAcesso(user, idPaciente);
    const meta = await this.prisma.meta.findUnique({ where: { id } });
    if (!meta || meta.idPaciente !== idPaciente) throw new NotFoundException('Meta não encontrada');
    await this.prisma.meta.delete({ where: { id } });
    return { ok: true };
  }

  private async assertAcesso(user: JwtPayloadUser, idPaciente: number) {
    const wid = requireWorkspaceId(user);
    const ok = await this.prisma.paciente.findFirst({
      where: { id: idPaciente, workspaceId: wid, idNutricionista: user.sub },
    });
    if (!ok) throw new ForbiddenException('Paciente não vinculado a você');
  }
}
