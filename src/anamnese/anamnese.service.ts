import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import {
  isAdminSistema,
  requireWorkspaceId,
} from '../common/tenant/tenant-scope';
import { CreateAnamneseDto } from './dto/create-anamnese.dto';
import { UpdateAnamneseDto } from './dto/update-anamnese.dto';

@Injectable()
export class AnamneseService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensurePacienteAccess(
    idPaciente: number,
    user: JwtPayloadUser,
  ): Promise<void> {
    if (isAdminSistema(user)) return;
    if (user.perfil === PerfilUsuario.paciente && user.sub === idPaciente)
      return;
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
    if (!paciente) {
      throw new ForbiddenException(
        'Paciente não encontrado ou sem permissão',
      );
    }
  }

  async create(dto: CreateAnamneseDto, user: JwtPayloadUser) {
    await this.ensurePacienteAccess(dto.idPaciente, user);
    const { idPaciente, data: dataStr, ...rest } = dto;
    return this.prisma.anamnese.create({
      data: {
        paciente: { connect: { id: idPaciente } },
        data: dataStr ? new Date(dataStr) : new Date(),
        ...rest,
      },
    });
  }

  async findByPaciente(idPaciente: number, user: JwtPayloadUser) {
    await this.ensurePacienteAccess(idPaciente, user);
    return this.prisma.anamnese.findMany({
      where: { idPaciente },
      orderBy: { data: 'desc' },
    });
  }

  async findOne(id: number, user: JwtPayloadUser) {
    const anamnese = await this.prisma.anamnese.findUnique({
      where: { id },
    });
    if (!anamnese) throw new NotFoundException('Anamnese não encontrada');
    await this.ensurePacienteAccess(anamnese.idPaciente, user);
    return anamnese;
  }

  async update(id: number, dto: UpdateAnamneseDto, user: JwtPayloadUser) {
    const anamnese = await this.prisma.anamnese.findUnique({
      where: { id },
    });
    if (!anamnese) throw new NotFoundException('Anamnese não encontrada');
    await this.ensurePacienteAccess(anamnese.idPaciente, user);
    return this.prisma.anamnese.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number, user: JwtPayloadUser) {
    const anamnese = await this.prisma.anamnese.findUnique({
      where: { id },
    });
    if (!anamnese) throw new NotFoundException('Anamnese não encontrada');
    await this.ensurePacienteAccess(anamnese.idPaciente, user);
    await this.prisma.anamnese.delete({ where: { id } });
    return { deleted: true };
  }
}
