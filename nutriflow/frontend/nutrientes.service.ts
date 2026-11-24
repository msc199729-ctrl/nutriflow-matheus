import { api } from "@/lib/axios";

/** Um nutriente já calculado pelo backend. */
export interface TotalNutriente {
  chave: string;
  rotulo: string;
  unidade: string;
  grupo: "minerais" | "vitaminas" | "gorduras";
  prescrito: number;
  referencia: number | null;
  tipoReferencia: "RDA" | "AI" | "LIMITE" | "PERCENTUAL_ENERGIA" | "SEM_REFERENCIA";
  percentual: number | null;
  nota?: string;
  /** o plano tem alimento que não informa este nutriente */
  incompleto?: boolean;
}

export interface NutrientesDoPlano {
  idPlano: number;
  nomePlano: string | null;
  contexto: {
    sexo: "M" | "F";
    idadeAnos: number;
    referencia: string;
  };
  kcalTotal: number;
  cobertura: {
    itensTotais: number;
    itensSemAlimento: number;
    /** alimentos que não têm nenhum micronutriente (ex.: rótulo importado) */
    alimentosSemDados: string[];
  };
  totais: TotalNutriente[];
}

export interface ReferenciaNutriente {
  chave: string;
  rotulo: string;
  unidade: string;
  grupo: "minerais" | "vitaminas" | "gorduras";
  valor: number | null;
  tipo: string;
  nota?: string;
}

export const nutrientesService = {
  /** Totais de micronutrientes de um plano salvo (aba "Ver total de nutrientes"). */
  async doPlano(idPlano: number): Promise<NutrientesDoPlano> {
    const { data } = await api.get<NutrientesDoPlano>(
      `/planos-alimentares/${idPlano}/nutrientes`,
    );
    return data;
  },

  /** Só as referências do paciente — para o gerador em memória. */
  async referencias(idPaciente: number): Promise<{
    contexto: NutrientesDoPlano["contexto"];
    nutrientes: ReferenciaNutriente[];
  }> {
    const { data } = await api.get<{
      contexto: NutrientesDoPlano["contexto"];
      nutrientes: ReferenciaNutriente[];
    }>(`/pacientes/${idPaciente}/nutrientes-referencia`);
    return data;
  },
};
