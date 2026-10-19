import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../common/tenant/tenant-scope';
import { CreateTreinoDto } from './dto/create-treino.dto';

@Injectable()
export class TreinosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTreinoDto, user: JwtPayloadUser, idPaciente: number) {
    await this.assertAcesso(user, idPaciente);
    return this.prisma.treino.create({
      data: {
        idPaciente,
        data: new Date(dto.data),
        tipo: dto.tipo,
        duracaoMin: dto.duracaoMin,
        intensidade: dto.intensidade,
        observacoes: dto.observacoes,
      },
    });
  }

  async findAll(user: JwtPayloadUser, idPaciente: number) {
    await this.assertAcesso(user, idPaciente);
    return this.prisma.treino.findMany({ where: { idPaciente }, orderBy: { data: 'desc' } });
  }

  async remove(user: JwtPayloadUser, idPaciente: number, id: number) {
    await this.assertAcesso(user, idPaciente);
    const treino = await this.prisma.treino.findUnique({ where: { id } });
    if (!treino || treino.idPaciente !== idPaciente) throw new NotFoundException('Treino não encontrado');
    await this.prisma.treino.delete({ where: { id } });
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