import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { requireWorkspaceId } from '../common/tenant/tenant-scope';

@Injectable()
export class AnaliseService {
  constructor(private readonly prisma: PrismaService) {}

  async evolucao(user: JwtPayloadUser, idPaciente: number) {
    const wid = requireWorkspaceId(user);
    const ok = await this.prisma.paciente.findFirst({
      where: { id: idPaciente, workspaceId: wid, idNutricionista: user.sub },
    });
    if (!ok) throw new ForbiddenException('Paciente não vinculado a você');

    const registros = await this.prisma.registroDiario.findMany({
      where: { idPaciente },
      orderBy: { registradoEm: 'asc' },
      select: { registradoEm: true, horasSono: true, pesoKg: true, ingestaoAguaMl: true },
    });

    const treinos = await this.prisma.treino.findMany({
      where: { idPaciente },
      orderBy: { data: 'asc' },
      select: { data: true, tipo: true, duracaoMin: true },
    });

    const comPeso = registros.filter((r) => r.pesoKg != null);
    const variacaoPeso = comPeso.length >= 2
      ? Number((comPeso[comPeso.length - 1].pesoKg! - comPeso[0].pesoKg!).toFixed(1))
      : null;

    return {
      registros,
      treinos,
      resumo: {
        totalRegistros: registros.length,
        totalTreinos: treinos.length,
        mediaSonoHoras: this.media(registros.map((r) => r.horasSono)),
        mediaAguaMl: this.media(registros.map((r) => r.ingestaoAguaMl)),
        variacaoPesoKg: variacaoPeso,
      },
    };
  }

  private media(valores: (number | null)[]): number | null {
    const validos = valores.filter((v): v is number => v != null);
    if (!validos.length) return null;
    return Number((validos.reduce((a, b) => a + b, 0) / validos.length).toFixed(1));
  }
}