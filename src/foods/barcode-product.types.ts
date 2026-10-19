/**
 * Dados normalizados vindos de um provedor externo de produto por código de barras.
 * Permite trocar Open Food Facts por FatSecret (ou outro) implementando {@link BarcodeProductProvider}.
 */
export type BarcodeProductNutriments = {
  calorias: number | null;
  proteinas: number | null;
  carboidratos: number | null;
  gorduras: number | null;
  fibras: number | null;
  sodio: number | null;
  ehUltraprocessado: boolean;
  scoreNova: number | null;
};

export type BarcodeProductPayload = {
  nome: string;
  marca: string | null;
} & BarcodeProductNutriments;

export interface BarcodeProductProvider {
  fetchByBarcode(normalizedCode: string): Promise<BarcodeProductPayload | null>;
}
