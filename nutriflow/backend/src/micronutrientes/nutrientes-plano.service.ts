import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PacientesService } from '../pacientes/pacientes.service';
import { idadeEmAnos } from '../physical-evaluations/physical-evaluations-calc.service';
import {
  agregarNutrientes,
  referenciasDri,
  NUTRIENTES,
  type AlimentoNutrientes,
  type ContextoDri,
  type ItemPlano,
} from './micronutrientes';

/**
 * Leitura dos 23 campos de micronutrientes de um BaseAlimento.
 * Concentrado aqui para não repetir 23 nomes em cada consulta.
 */
const SELECT_MICRO = {
  calcio: true,
  ferro: true,
  magnesio: true,
  fosforo: true,
  potassio: true,
  zinco: true,
  cobre: true,
  selenio: true,
  vitaminaARae: true,
  vitaminaC: true,
  vitaminaD: true,
  vitaminaE: true,
  tiamina: true,
  vitaminaB2: true,
  vitaminaB3: true,
  vitaminaB6: true,
  vitaminaB12: true,
  folato: true,
  gorduraSaturada: true,
  gorduraMonoinsaturada: true,
  gorduraPoliinsaturada: true,
  gorduraTrans: true,
  colesterol: true,
} as const;

/**
 * Estimativa de gestação/lactação a partir do sexo e da idade não é possível
 * hoje: o modelo `Paciente` não tem esse campo. Por isso o padrão é adulto.
 * Quando o campo existir, basta preencher aqui.
 */
function contextoDoPaciente(paciente: {
  dataNascimento: Date | null;
  genero: string | null;
}): ContextoDri {
  const idade = idadeEmAnos(paciente.dataNascimento) ?? 30;
  return {
    sexo: String(paciente.genero ?? '').toUpperCase().startsWith('F') ? 'F' : 'M',
    idadeAnos: idade,
  };
}

@Injectable()
export class NutrientesPlanoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pacientesService: PacientesService,
  ) {}

  /**
   * Totais de micronutrientes do plano, com referência DRI do paciente.
   *
   * Faz UMA consulta ao plano (com alimentos) em vez de uma por item.
   * Só os 23 campos necesários são lidos — não o registro inteiro.
   */
  async nutrientesDoPlano(idPlano: number, user: JwtPayloadUser) {
    const plano = await this.prisma.planoAlimentar.findUnique({
      where: { id: idPlano },
      select: {
        id: true,
        nome: true,
        idPaciente: true,
        paciente: { select: { dataNascimento: true, genero: true } },
        refeicoesPlanejadas: {
          select: {
            nome: true,
            horarioSugerido: true,
            itensDieta: {
              select: {
                idAlimento: true,
                quantidadeGramas: true,
                aVontade: true,
                alimento: {
                  select: {
                    id: true,
                    nome: true,
                    calorias: true,
                    ...SELECT_MICRO,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!plano) throw new NotFoundException('Plano não encontrado');
    await this.pacientesService.findOne(plano.idPaciente, user);

    // Deduplica alimentos: o mesmo alimento pode aparecer em várias refeições.
    const alimentos = new Map<number, AlimentoNutrientes>();
    const itens: ItemPlano[] = [];

    for (const ref of plano.refeicoesPlanejadas) {
      for (const it of ref.itensDieta) {
        const a = it.alimento;
        if (!alimentos.has(a.id)) {
          const micros: Record<string, number | null> = {};
          for (const def of NUTRIENTES) {
            const v = (a as unknown as Record<string, unknown>)[def.campoPrisma];
            micros[def.chave] = typeof v === 'number' ? v : null;
          }
          alimentos.set(a.id, {
            id: a.id,
            nome: a.nome,
            calorias: a.calorias,
            micros,
          });
        }
        itens.push({
          idAlimento: it.idAlimento,
          quantidadeGramas: it.quantidadeGramas ?? 0,
          aVontade: it.aVontade,
        });
      }
    }

    const ctx = contextoDoPaciente(plano.paciente);
    const resultado = agregarNutrientes(itens, alimentos, ctx);

    return {
      idPlano: plano.id,
      nomePlano: plano.nome,
      contexto: {
        sexo: ctx.sexo,
        idadeAnos: ctx.idadeAnos,
        referencia: 'DRI (IOM/National Academies) — adulto',
      },
      kcalTotal: resultado.kcalTotal,
      cobertura: resultado.cobertura,
      totais: resultado.totais,
    };
  }

  /**
   * Referências isoladas — útil para montar a tela antes de ter um plano salvo
   * (o gerador de dietas em memória usa isto).
   */
  async referenciasDoPaciente(idPaciente: number, user: JwtPayloadUser) {
    const paciente = await this.pacientesService.findOne(idPaciente, user);
    const ctx = contextoDoPaciente(
      paciente as unknown as { dataNascimento: Date | null; genero: string | null },
    );
    const refs = referenciasDri(ctx);
    return {
      contexto: {
        sexo: ctx.sexo,
        idadeAnos: ctx.idadeAnos,
        referencia: 'DRI (IOM/National Academies) — adulto',
      },
      nutrientes: NUTRIENTES.map((n) => ({
        chave: n.chave,
        rotulo: n.rotulo,
        grupo: n.grupo,
        ...refs[n.chave],
      })),
    };
  }
}
