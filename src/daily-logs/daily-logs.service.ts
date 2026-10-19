import { ForbiddenException, Injectable } from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../common/tenant/tenant-scope';
import { CreateRegistroDiarioDto } from './dto/create-registro-diario.dto';

@Injectable()
export class DailyLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByDay(user: JwtPayloadUser, dataStr?: string) {
    if (user.perfil !== 'paciente') {
      throw new ForbiddenException('Apenas o paciente pode consultar seus registros diários');
    }
    let data: Date;
    if (dataStr) {
      data = new Date(dataStr);
      if (Number.isNaN(data.getTime())) {
        data = new Date();
      }
    } else {
      data = new Date();
    }
    const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0);
    const fim = new Date(data.getFullYear(), data.getMonth(), data.getDate(), 23, 59, 59);
    const registros = await this.prisma.registroDiario.findMany({
      where: {
        idPaciente: user.sub,
        registradoEm: { gte: inicio, lte: fim },
      },
      include: { itensConsumidos: { include: { alimento: true } } },
      orderBy: { registradoEm: 'asc' },
    });
    const totalAguaMl = registros.reduce((acc, r) => acc + (r.ingestaoAguaMl ?? 0), 0);
    return { registros, totalAguaMl };
  }

  private async resolveIdPaciente(
    dto: CreateRegistroDiarioDto,
    user: JwtPayloadUser,
  ): Promise<number> {
    if (dto.idPaciente != null) {
      if (user.perfil === 'paciente' && dto.idPaciente !== user.sub) {
        throw new ForbiddenException('Paciente só pode criar registro para si mesmo');
      }
      if (user.perfil === PerfilUsuario.nutricionista) {
        const wid = requireWorkspaceId(user);
        const ok = await this.prisma.paciente.findFirst({
          where: {
            id: dto.idPaciente,
            workspaceId: wid,
            idNutricionista: user.sub,
          },
        });
        if (!ok) throw new ForbiddenException('Paciente não vinculado a você');
      }
      if (user.perfil === PerfilUsuario.admin_clinica) {
        const wid = requireWorkspaceId(user);
        const ok = await this.prisma.paciente.findFirst({
          where: { id: dto.idPaciente, workspaceId: wid },
        });
        if (!ok) throw new ForbiddenException('Paciente não pertence ao workspace');
      }
      return dto.idPaciente;
    }
    if (user.perfil === 'paciente') return user.sub;
    throw new ForbiddenException('Informe idPaciente ao criar registro');
  }

  async create(
    dto: CreateRegistroDiarioDto,
    user: JwtPayloadUser,
    urlFotoPrato?: string,
  ) {
    const idPaciente = await this.resolveIdPaciente(dto, user);
    const itens = Array.isArray(dto.itens) ? dto.itens : [];
    const registro = await this.prisma.registroDiario.create({
      data: {
        idPaciente,
        registradoEm: new Date(),
        tipoRefeicao: dto.tipoRefeicao ?? null,
        urlFotoPrato: urlFotoPrato ?? null,
        ingestaoAguaMl: dto.ingestaoAguaMl ?? null,
      },
    });
    if (itens.length > 0) {
      await this.prisma.itemConsumido.createMany({
        data: itens.map((item) => ({
          idRegistro: registro.id,
          idAlimento: item.idAlimento,
          quantidadeConsumida: item.quantidadeConsumida ?? null,
          origem: item.origem,
        })),
      });
    }
    return this.prisma.registroDiario.findUnique({
      where: { id: registro.id },
      include: { itensConsumidos: { include: { alimento: true } } },
    });
  }

  /**
   * Placeholder: enviar imagem do prato para API de Visão da OpenAI (OCR/identificação de alimentos).
   * Implementação futura: multipart para OpenAI Vision e retorno estruturado.
   */
  async analisarImagemPrato(_imageBuffer: Buffer): Promise<{ placeholder: boolean }> {
    return { placeholder: true };
  }
}
