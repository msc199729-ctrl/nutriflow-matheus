/**
 * Serviço de micronutrientes: agrega o plano alimentar e compara com a DRI.
 *
 * Este arquivo é a versão de referência com a lógica pura. A integração em
 * `src/planos-alimentares/planos-alimentares.service.ts` usa estas funções.
 */
export {
  NUTRIENTES,
  CHAVE_POR_COMPONENTE_TBCA,
  referenciasDri,
  agregarNutrientes,
  type ContextoDri,
  type DefinicaoNutriente,
  type GrupoNutriente,
  type ItemPlano,
  type AlimentoNutrientes,
  type TotalNutriente,
  type ResultadoNutrientes,
  type MapaReferencias,
  type TipoReferencia,
} from './micronutrientes';
