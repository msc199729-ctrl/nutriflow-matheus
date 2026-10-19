import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PerfilUsuario, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import {
  isAdminSistema,
  requireWorkspaceId,
} from '../common/tenant/tenant-scope';
import {
  calcularImc,
  classificarImc,
  calcularRcq,
  riscoMetabolicoRcq,
  calcularGorduraPorProtocolo,
  idadeEmAnos,
} from './physical-evaluations-calc.service';
import { CreateAvaliacaoFisicaDto } from './dto/create-avaliacao-fisica.dto';
import { UpdateAvaliacaoFisicaDto } from './dto/update-avaliacao-fisica.dto';

@Injectable()
export class PhysicalEvaluationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensurePacienteAccess(
    idPaciente: number,
    user: JwtPayloadUser,
  ): Promise<void> {
    if (isAdminSistema(user)) return;
    if (user.perfil === PerfilUsuario.paciente && user.sub === idPaciente) return;
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
      throw new ForbiddenException('Paciente não encontrado ou sem permissão');
    }
  }

  private async ensureAvaliacaoAccess(
    idAvaliacao: number,
    user: JwtPayloadUser,
  ): Promise<{ idPaciente: number }> {
    const av = await this.prisma.avaliacaoFisica.findUnique({
      where: { id: idAvaliacao },
      select: { idPaciente: true },
    });
    if (!av) throw new NotFoundException('Avaliação não encontrada');
    await this.ensurePacienteAccess(av.idPaciente, user);
    return av;
  }

  async create(
    dto: CreateAvaliacaoFisicaDto,
    user: JwtPayloadUser,
  ) {
    await this.ensurePacienteAccess(dto.idPaciente, user);

    const paciente = await this.prisma.paciente.findUnique({
      where: { id: dto.idPaciente },
      select: { dataNascimento: true, genero: true },
    });

    const data: Prisma.AvaliacaoFisicaCreateInput = {
      paciente: { connect: { id: dto.idPaciente } },
      data: dto.data ? new Date(dto.data) : new Date(),
      peso: dto.peso ?? undefined,
      altura: dto.altura ?? undefined,
      alturaSentadoCm: dto.alturaSentadoCm ?? undefined,
      alturaJoelhoCm: dto.alturaJoelhoCm ?? undefined,
      circCintura: dto.circCintura ?? undefined,
      circQuadril: dto.circQuadril ?? undefined,
      percentualGordura: dto.percentualGordura ?? undefined,
      protocoloGordura: dto.protocoloGordura ?? undefined,
      dobraTricipital: dto.dobraTricipital ?? undefined,
      dobraBicipital: dto.dobraBicipital ?? undefined,
      dobraSubescapular: dto.dobraSubescapular ?? undefined,
      dobraAxilarMedia: dto.dobraAxilarMedia ?? undefined,
      dobraToracica: dto.dobraToracica ?? undefined,
      dobraAbdominal: dto.dobraAbdominal ?? undefined,
      dobraSuprailiaca: dto.dobraSuprailiaca ?? undefined,
      dobraSupraEspinhal: dto.dobraSupraEspinhal ?? undefined,
      dobraCoxa: dto.dobraCoxa ?? undefined,
      dobraPanturrilha: dto.dobraPanturrilha ?? undefined,
      circPescoco: dto.circPescoco ?? undefined,
      circTorax: dto.circTorax ?? undefined,
      circOmbro: dto.circOmbro ?? undefined,
      circAbdomen: dto.circAbdomen ?? undefined,
      circBracoDirRelaxado: dto.circBracoDirRelaxado ?? undefined,
      circBracoEsqRelaxado: dto.circBracoEsqRelaxado ?? undefined,
      circBracoDirContraido: dto.circBracoDirContraido ?? undefined,
      circBracoEsqContraido: dto.circBracoEsqContraido ?? undefined,
      circBracoDirCmb: dto.circBracoDirCmb ?? undefined,
      circBracoEsqCmb: dto.circBracoEsqCmb ?? undefined,
      circAntebracoDirBraco: dto.circAntebracoDirBraco ?? undefined,
      circAntebracoEsq: dto.circAntebracoEsq ?? undefined,
      circCoxaProximalDir: dto.circCoxaProximalDir ?? undefined,
      circCoxaProximalEsq: dto.circCoxaProximalEsq ?? undefined,
      circCoxaMedialDir: dto.circCoxaMedialDir ?? undefined,
      circCoxaMedialEsq: dto.circCoxaMedialEsq ?? undefined,
      circCoxaDistalDir: dto.circCoxaDistalDir ?? undefined,
      circCoxaDistalEsq: dto.circCoxaDistalEsq ?? undefined,
      circPanturrilhaDir: dto.circPanturrilhaDir ?? undefined,
      circPanturrilhaEsq: dto.circPanturrilhaEsq ?? undefined,
      biaPercentualGordura: dto.biaPercentualGordura ?? undefined,
      biaClassificacaoGordura: dto.biaClassificacaoGordura ?? undefined,
      biaPercentualMassaMuscular: dto.biaPercentualMassaMuscular ?? undefined,
      biaMassaMuscularKg: dto.biaMassaMuscularKg ?? undefined,
      biaAguaCorporalTotalKg: dto.biaAguaCorporalTotalKg ?? undefined,
      biaMassaOsseaKg: dto.biaMassaOsseaKg ?? undefined,
      biaIndiceGorduraVisceral: dto.biaIndiceGorduraVisceral ?? undefined,
      biaIdadeMetabolica: dto.biaIdadeMetabolica ?? undefined,
      urlFotoFrente: dto.urlFotoFrente ?? undefined,
      urlFotoCostas: dto.urlFotoCostas ?? undefined,
      urlFotoLado: dto.urlFotoLado ?? undefined,
    };

    const peso = dto.peso;
    const altura = dto.altura;
    const circCintura = dto.circCintura;
    const circQuadril = dto.circQuadril;

    if (peso != null && altura != null && altura > 0) {
      const imc = calcularImc(peso, altura);
      data.imc = imc;
      data.classificacaoImc = classificarImc(imc);
    }
    if (
      circCintura != null &&
      circQuadril != null &&
      circQuadril > 0
    ) {
      const rcq = calcularRcq(circCintura, circQuadril);
      data.rcq = rcq;
      data.riscoMetabolicoRcq = riscoMetabolicoRcq(
        rcq,
        paciente?.genero ?? undefined,
      );
    }

    // Auto-calc massa gorda via bioimpedância: Peso × (%G / 100)
    if (peso != null && dto.biaPercentualGordura != null) {
      data.massaGorduraKg = Math.round(peso * (dto.biaPercentualGordura / 100) * 100) / 100;
      data.massaLivreGorduraKg = Math.round((peso - data.massaGorduraKg) * 100) / 100;
    }

    // Auto-calc gordura por dobras cutâneas quando protocolo selecionado
    if (dto.protocoloGordura) {
      const idade = idadeEmAnos(paciente?.dataNascimento ?? undefined);
      if (idade != null) {
        const resultado = calcularGorduraPorProtocolo(
          dto.protocoloGordura,
          {
            tricipital: dto.dobraTricipital,
            bicipital: dto.dobraBicipital,
            subescapular: dto.dobraSubescapular,
            axilarMedia: dto.dobraAxilarMedia,
            toracica: dto.dobraToracica,
            abdominal: dto.dobraAbdominal,
            suprailiaca: dto.dobraSuprailiaca,
            supraEspinhal: dto.dobraSupraEspinhal,
            coxa: dto.dobraCoxa,
            panturrilha: dto.dobraPanturrilha,
          },
          idade,
          paciente?.genero ?? undefined,
        );
        if (resultado) {
          if (data.percentualGordura == null) {
            data.percentualGordura = resultado.percentualGordura;
          }
          data.somatorioDobrasMm = resultado.somatorioDobrasMm;
          if (peso != null && data.massaGorduraKg == null) {
            data.massaGorduraKg = Math.round(peso * (resultado.percentualGordura / 100) * 100) / 100;
            data.massaLivreGorduraKg = Math.round((peso - data.massaGorduraKg) * 100) / 100;
          }
        }
      }
    }

    const created = await this.prisma.avaliacaoFisica.create({ data });

    return created;
  }

  async findAll(idPaciente: number | undefined, user: JwtPayloadUser) {
    if (idPaciente != null) {
      await this.ensurePacienteAccess(idPaciente, user);
      return this.prisma.avaliacaoFisica.findMany({
        where: { idPaciente },
        orderBy: { data: 'desc' },
      });
    }
    if (user.perfil === PerfilUsuario.paciente) {
      return this.prisma.avaliacaoFisica.findMany({
        where: { idPaciente: user.sub },
        orderBy: { data: 'desc' },
      });
    }
    if (isAdminSistema(user)) {
      return this.prisma.avaliacaoFisica.findMany({
        orderBy: { data: 'desc' },
      });
    }
    const wid = requireWorkspaceId(user);
    if (user.perfil === PerfilUsuario.nutricionista) {
      return this.prisma.avaliacaoFisica.findMany({
        where: { paciente: { workspaceId: wid, idNutricionista: user.sub } },
        orderBy: { data: 'desc' },
      });
    }
    if (user.perfil === PerfilUsuario.admin_clinica) {
      return this.prisma.avaliacaoFisica.findMany({
        where: { paciente: { workspaceId: wid } },
        orderBy: { data: 'desc' },
      });
    }
    throw new ForbiddenException('Acesso negado');
  }

  async findOne(id: number, user: JwtPayloadUser) {
    await this.ensureAvaliacaoAccess(id, user);
    const av = await this.prisma.avaliacaoFisica.findUnique({
      where: { id },
      include: { paciente: true },
    });
    if (!av) throw new NotFoundException('Avaliação não encontrada');
    return av;
  }

  async update(
    id: number,
    dto: UpdateAvaliacaoFisicaDto,
    user: JwtPayloadUser,
  ) {
    const { idPaciente } = await this.ensureAvaliacaoAccess(id, user);
    const { idPaciente: _omit, ...rest } = dto;

    const paciente = await this.prisma.paciente.findUnique({
      where: { id: idPaciente },
      select: { dataNascimento: true, genero: true },
    });

    const updateData: Prisma.AvaliacaoFisicaUpdateInput = {};
    if (rest.data != null) updateData.data = new Date(rest.data);
    if (rest.peso != null) updateData.peso = rest.peso;
    if (rest.altura != null) updateData.altura = rest.altura;
    if (rest.alturaSentadoCm != null) updateData.alturaSentadoCm = rest.alturaSentadoCm;
    if (rest.alturaJoelhoCm != null) updateData.alturaJoelhoCm = rest.alturaJoelhoCm;
    if (rest.circCintura != null) updateData.circCintura = rest.circCintura;
    if (rest.circQuadril != null) updateData.circQuadril = rest.circQuadril;
    if (rest.percentualGordura != null) updateData.percentualGordura = rest.percentualGordura;
    if (rest.protocoloGordura != null) updateData.protocoloGordura = rest.protocoloGordura;
    if (rest.dobraTricipital != null) updateData.dobraTricipital = rest.dobraTricipital;
    if (rest.dobraBicipital != null) updateData.dobraBicipital = rest.dobraBicipital;
    if (rest.dobraSubescapular != null) updateData.dobraSubescapular = rest.dobraSubescapular;
    if (rest.dobraAxilarMedia != null) updateData.dobraAxilarMedia = rest.dobraAxilarMedia;
    if (rest.dobraToracica != null) updateData.dobraToracica = rest.dobraToracica;
    if (rest.dobraAbdominal != null) updateData.dobraAbdominal = rest.dobraAbdominal;
    if (rest.dobraSuprailiaca != null) updateData.dobraSuprailiaca = rest.dobraSuprailiaca;
    if (rest.dobraSupraEspinhal != null) updateData.dobraSupraEspinhal = rest.dobraSupraEspinhal;
    if (rest.dobraCoxa != null) updateData.dobraCoxa = rest.dobraCoxa;
    if (rest.dobraPanturrilha != null) updateData.dobraPanturrilha = rest.dobraPanturrilha;
    if (rest.circPescoco != null) updateData.circPescoco = rest.circPescoco;
    if (rest.circTorax != null) updateData.circTorax = rest.circTorax;
    if (rest.circOmbro != null) updateData.circOmbro = rest.circOmbro;
    if (rest.circAbdomen != null) updateData.circAbdomen = rest.circAbdomen;
    if (rest.circBracoDirRelaxado != null) updateData.circBracoDirRelaxado = rest.circBracoDirRelaxado;
    if (rest.circBracoEsqRelaxado != null) updateData.circBracoEsqRelaxado = rest.circBracoEsqRelaxado;
    if (rest.circBracoDirContraido != null) updateData.circBracoDirContraido = rest.circBracoDirContraido;
    if (rest.circBracoEsqContraido != null) updateData.circBracoEsqContraido = rest.circBracoEsqContraido;
    if (rest.circBracoDirCmb != null) updateData.circBracoDirCmb = rest.circBracoDirCmb;
    if (rest.circBracoEsqCmb != null) updateData.circBracoEsqCmb = rest.circBracoEsqCmb;
    if (rest.circAntebracoDirBraco != null) updateData.circAntebracoDirBraco = rest.circAntebracoDirBraco;
    if (rest.circAntebracoEsq != null) updateData.circAntebracoEsq = rest.circAntebracoEsq;
    if (rest.circCoxaProximalDir != null) updateData.circCoxaProximalDir = rest.circCoxaProximalDir;
    if (rest.circCoxaProximalEsq != null) updateData.circCoxaProximalEsq = rest.circCoxaProximalEsq;
    if (rest.circCoxaMedialDir != null) updateData.circCoxaMedialDir = rest.circCoxaMedialDir;
    if (rest.circCoxaMedialEsq != null) updateData.circCoxaMedialEsq = rest.circCoxaMedialEsq;
    if (rest.circCoxaDistalDir != null) updateData.circCoxaDistalDir = rest.circCoxaDistalDir;
    if (rest.circCoxaDistalEsq != null) updateData.circCoxaDistalEsq = rest.circCoxaDistalEsq;
    if (rest.circPanturrilhaDir != null) updateData.circPanturrilhaDir = rest.circPanturrilhaDir;
    if (rest.circPanturrilhaEsq != null) updateData.circPanturrilhaEsq = rest.circPanturrilhaEsq;
    if (rest.biaPercentualGordura != null) updateData.biaPercentualGordura = rest.biaPercentualGordura;
    if (rest.biaClassificacaoGordura != null) updateData.biaClassificacaoGordura = rest.biaClassificacaoGordura;
    if (rest.biaPercentualMassaMuscular != null) updateData.biaPercentualMassaMuscular = rest.biaPercentualMassaMuscular;
    if (rest.biaMassaMuscularKg != null) updateData.biaMassaMuscularKg = rest.biaMassaMuscularKg;
    if (rest.biaAguaCorporalTotalKg != null) updateData.biaAguaCorporalTotalKg = rest.biaAguaCorporalTotalKg;
    if (rest.biaMassaOsseaKg != null) updateData.biaMassaOsseaKg = rest.biaMassaOsseaKg;
    if (rest.biaIndiceGorduraVisceral != null) updateData.biaIndiceGorduraVisceral = rest.biaIndiceGorduraVisceral;
    if (rest.biaIdadeMetabolica != null) updateData.biaIdadeMetabolica = rest.biaIdadeMetabolica;
    if (rest.urlFotoFrente != null) updateData.urlFotoFrente = rest.urlFotoFrente;
    if (rest.urlFotoCostas != null) updateData.urlFotoCostas = rest.urlFotoCostas;
    if (rest.urlFotoLado != null) updateData.urlFotoLado = rest.urlFotoLado;

    const peso = rest.peso;
    const altura = rest.altura;
    const circCintura = rest.circCintura;
    const circQuadril = rest.circQuadril;

    if (peso != null && altura != null && altura > 0) {
      updateData.imc = calcularImc(peso, altura);
      updateData.classificacaoImc = classificarImc(updateData.imc as number);
    }
    if (circCintura != null && circQuadril != null && circQuadril > 0) {
      updateData.rcq = calcularRcq(circCintura, circQuadril);
      updateData.riscoMetabolicoRcq = riscoMetabolicoRcq(
        updateData.rcq as number,
        paciente?.genero ?? undefined,
      );
    }

    // Auto-calc massa gorda via bioimpedância: Peso × (%G / 100)
    if (peso != null && rest.biaPercentualGordura != null) {
      updateData.massaGorduraKg = Math.round(peso * (rest.biaPercentualGordura / 100) * 100) / 100;
      updateData.massaLivreGorduraKg = Math.round((peso - (updateData.massaGorduraKg as number)) * 100) / 100;
    }

    // Auto-calc gordura por dobras cutâneas
    if (rest.protocoloGordura) {
      const idade = idadeEmAnos(paciente?.dataNascimento ?? undefined);
      if (idade != null) {
        const resultado = calcularGorduraPorProtocolo(
          rest.protocoloGordura,
          {
            tricipital: rest.dobraTricipital,
            bicipital: rest.dobraBicipital,
            subescapular: rest.dobraSubescapular,
            axilarMedia: rest.dobraAxilarMedia,
            toracica: rest.dobraToracica,
            abdominal: rest.dobraAbdominal,
            suprailiaca: rest.dobraSuprailiaca,
            supraEspinhal: rest.dobraSupraEspinhal,
            coxa: rest.dobraCoxa,
            panturrilha: rest.dobraPanturrilha,
          },
          idade,
          paciente?.genero ?? undefined,
        );
        if (resultado) {
          if (updateData.percentualGordura == null) {
            updateData.percentualGordura = resultado.percentualGordura;
          }
          updateData.somatorioDobrasMm = resultado.somatorioDobrasMm;
          if (peso != null && updateData.massaGorduraKg == null) {
            updateData.massaGorduraKg = Math.round(peso * (resultado.percentualGordura / 100) * 100) / 100;
            updateData.massaLivreGorduraKg = Math.round((peso - (updateData.massaGorduraKg as number)) * 100) / 100;
          }
        }
      }
    }

    return this.prisma.avaliacaoFisica.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: number, user: JwtPayloadUser) {
    await this.ensureAvaliacaoAccess(id, user);
    await this.prisma.avaliacaoFisica.delete({ where: { id } });
    return { deleted: true };
  }
}
