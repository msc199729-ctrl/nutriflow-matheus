import { Injectable } from '@nestjs/common';
import type {
  BarcodeProductPayload,
  BarcodeProductProvider,
} from '../barcode-product.types';
import { BarcodeUpstreamError } from '../errors/barcode-upstream.error';

const OPEN_FOOD_FACTS_URL =
  'https://world.openfoodfacts.org/api/v2/product';

interface OffProduct {
  product?: {
    product_name?: string;
    brands?: string;
    nutriments?: {
      'energy-kcal_100g'?: number;
      proteins_100g?: number;
      carbohydrates_100g?: number;
      fat_100g?: number;
      fiber_100g?: number;
      sodium_100g?: number;
    };
    nova_group?: number;
  };
}

function parseMarca(brands: string | undefined): string | null {
  if (!brands?.trim()) return null;
  const first = brands.split(',')[0]?.trim();
  return first || null;
}

@Injectable()
export class OpenFoodFactsBarcodeProvider implements BarcodeProductProvider {
  async fetchByBarcode(
    normalizedCode: string,
  ): Promise<BarcodeProductPayload | null> {
    const url = `${OPEN_FOOD_FACTS_URL}/${encodeURIComponent(normalizedCode)}.json`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        throw new BarcodeUpstreamError(
          `Open Food Facts HTTP ${res.status}`,
          'http',
        );
      }

      const data = (await res.json()) as OffProduct;
      if (!data?.product) return null;

      const p = data.product;
      const nut = p.nutriments ?? {};
      const energyKcal = nut['energy-kcal_100g'];
      const proteins = nut.proteins_100g;
      const carbohydrates = nut.carbohydrates_100g;
      const fat = nut.fat_100g;
      const fiber = nut.fiber_100g;
      const sodium100g = nut.sodium_100g;
      const sodioMg = sodium100g != null ? sodium100g * 1000 : null;

      const nome =
        (p.product_name as string | undefined)?.trim() ||
        `Produto ${normalizedCode}`;
      const novaGroup = p.nova_group;
      const ehUltraprocessado = novaGroup === 4;
      const scoreNova =
        typeof novaGroup === 'number' && novaGroup >= 1 && novaGroup <= 4
          ? novaGroup
          : null;

      return {
        nome,
        marca: parseMarca(p.brands),
        calorias: typeof energyKcal === 'number' ? energyKcal : null,
        proteinas: typeof proteins === 'number' ? proteins : null,
        carboidratos: typeof carbohydrates === 'number' ? carbohydrates : null,
        gorduras: typeof fat === 'number' ? fat : null,
        fibras: typeof fiber === 'number' ? fiber : null,
        sodio: sodioMg,
        ehUltraprocessado,
        scoreNova: typeof scoreNova === 'number' ? scoreNova : null,
      };
    } catch (e) {
      if (e instanceof BarcodeUpstreamError) throw e;
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
      if (name === 'AbortError') {
        throw new BarcodeUpstreamError('Timeout ao consultar Open Food Facts', 'timeout', e);
      }
      throw new BarcodeUpstreamError('Falha de rede ao consultar Open Food Facts', 'network', e);
    }
  }
}
