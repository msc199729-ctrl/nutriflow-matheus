import { Injectable } from '@nestjs/common';
import type { BaseAlimento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BarcodeProductProvider } from './barcode-product.types';
import { BarcodeUpstreamError } from './errors/barcode-upstream.error';
import { OpenFoodFactsBarcodeProvider } from './providers/open-food-facts-barcode.provider';
import { sanitizeBarcodeDigits } from './utils/sanitize-barcode';

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function searchRank(
  normalizedName: string,
  normalizedTerm: string,
  termTokens: string[],
): number {
  if (normalizedName === normalizedTerm) return 0;
  if (normalizedName.startsWith(normalizedTerm)) return 1;
  if (normalizedName.includes(` ${normalizedTerm}`)) return 2;

  const nameTokens = normalizedName.split(' ');
  const firstTokenMatchesStart =
    termTokens.length >= 2 &&
    nameTokens[0]?.startsWith(termTokens[0]) &&
    termTokens
      .slice(1)
      .every((termToken) =>
        nameTokens.some((nameToken) => nameToken.startsWith(termToken)),
      );
  if (firstTokenMatchesStart) return 3;

  const hasAllTokenPrefixes = termTokens.every((termToken) =>
    nameTokens.some((nameToken) => nameToken.startsWith(termToken)),
  );
  if (hasAllTokenPrefixes) return 4;

  if (normalizedName.includes(normalizedTerm)) return 5;
  return 99;
}

/**
 * Limpa nomes da TACO/TBCA para exibição amigável.
 * Ex: "Abacate, polpa, in natura, Persea americana" → "Polpa de abacate in natura"
 */
export function limparNomeAlimento(nomeOriginal: string): string {
  let nome = nomeOriginal.trim();

  nome = nome.replace(
    /,?\s*[A-Z][a-z]+ [a-z]+(\s+(var|subsp|ssp)\.\s+[a-z]+)?\.?\s*$/i,
    '',
  );

  const partes = nome
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (partes.length <= 1) return partes[0] || nomeOriginal;

  const [principal, ...complementos] = partes;
  const qualificadores: string[] = [];
  const preparacoes: string[] = [];

  for (const c of complementos) {
    const lower = c.toLowerCase();
    if (
      lower.startsWith('in natura') ||
      lower.startsWith('cru') ||
      lower.startsWith('cozid') ||
      lower.startsWith('assad') ||
      lower.startsWith('frit') ||
      lower.startsWith('grelhad') ||
      lower.startsWith('refogad') ||
      lower.startsWith('desidratad') ||
      lower.startsWith('seco') ||
      lower.startsWith('enlatad') ||
      lower.startsWith('congelad') ||
      lower.startsWith('em conserva') ||
      lower.startsWith('em calda') ||
      lower.startsWith('torrad') ||
      lower.startsWith('com sal') ||
      lower.startsWith('sem sal') ||
      lower.startsWith('sem pele') ||
      lower.startsWith('com pele') ||
      lower.startsWith('integral') ||
      lower.startsWith('light') ||
      lower.startsWith('diet')
    ) {
      preparacoes.push(c.toLowerCase());
    } else {
      qualificadores.push(c.toLowerCase());
    }
  }

  const parteQualif = qualificadores.length
    ? `${qualificadores.join(' ')} de `
    : '';
  const partePrep = preparacoes.length ? ` ${preparacoes.join(', ')}` : '';

  const resultado = `${parteQualif}${principal.toLowerCase()}${partePrep}`;
  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

@Injectable()
export class FoodsService {
  private readonly barcodeProvider: BarcodeProductProvider;

  constructor(
    private readonly prisma: PrismaService,
    offProvider: OpenFoodFactsBarcodeProvider,
  ) {
    this.barcodeProvider = offProvider;
  }

  private formatAlimento(
    alimento: { nome: string; [key: string]: unknown },
    opts?: { preserveOriginalNameOrder?: boolean },
  ) {
    const nomeExibicao = opts?.preserveOriginalNameOrder
      ? alimento.nome
      : limparNomeAlimento(alimento.nome);
    return { ...alimento, nomeExibicao };
  }

  async searchByText(texto: string, limit = 50) {
    const term = texto.trim();
    if (!term) return [];
    const normalizedTerm = normalizeSearchText(term);
    if (!normalizedTerm) return [];
    const termTokens = normalizedTerm.split(' ').filter(Boolean);

    const rows = await this.prisma.baseAlimento.findMany();

    const ranked = rows
      .map((row) => {
        const normalizedName = normalizeSearchText(row.nome);
        const rank = searchRank(normalizedName, normalizedTerm, termTokens);
        const phraseIndex = normalizedName.indexOf(normalizedTerm);
        return { row, rank, normalizedName, phraseIndex };
      })
      .filter((item) => item.rank < 99)
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.phraseIndex !== b.phraseIndex) {
          if (a.phraseIndex === -1) return 1;
          if (b.phraseIndex === -1) return -1;
          return a.phraseIndex - b.phraseIndex;
        }
        if (a.normalizedName.length !== b.normalizedName.length) {
          return a.normalizedName.length - b.normalizedName.length;
        }
        return a.row.nome.localeCompare(b.row.nome, 'pt-BR', {
          sensitivity: 'base',
        });
      })
      .slice(0, limit)
      .map((item) =>
        this.formatAlimento(item.row, { preserveOriginalNameOrder: true }),
      );

    return ranked;
  }

  /**
   * Código já validado (8–14 dígitos). Propaga {@link BarcodeUpstreamError} em falha de rede/timeout.
   */
  async findByBarcodeStrict(
    sanitizedDigits: string,
  ): Promise<BaseAlimento | null> {
    const local = await this.prisma.baseAlimento.findUnique({
      where: { codigoBarras: sanitizedDigits },
    });
    if (local) return local;

    const fromApi = await this.barcodeProvider.fetchByBarcode(sanitizedDigits);
    if (!fromApi) return null;

    return this.prisma.baseAlimento.create({
      data: {
        nome: fromApi.nome,
        marca: fromApi.marca ?? undefined,
        codigoBarras: sanitizedDigits,
        fonte: 'open_food_facts',
        calorias: fromApi.calorias ?? undefined,
        proteinas: fromApi.proteinas ?? undefined,
        carboidratos: fromApi.carboidratos ?? undefined,
        gorduras: fromApi.gorduras ?? undefined,
        fibras: fromApi.fibras ?? undefined,
        sodio: fromApi.sodio ?? undefined,
        ehUltraprocessado: fromApi.ehUltraprocessado,
        scoreNova: fromApi.scoreNova ?? undefined,
      },
    });
  }

  /**
   * Busca por código de barras (compat.: aceita qualquer sequência de dígitos após limpeza).
   * Erros de rede na API externa resultam em `null`.
   */
  async findByBarcode(codigoBarras: string) {
    const normalized = codigoBarras.trim().replace(/\D/g, '');
    if (!normalized) return null;

    const local = await this.prisma.baseAlimento.findUnique({
      where: { codigoBarras: normalized },
    });
    if (local) return local;

    const strict = sanitizeBarcodeDigits(normalized);
    if (!strict) {
      try {
        const fromApi = await this.barcodeProvider.fetchByBarcode(normalized);
        if (!fromApi) return null;
        return this.prisma.baseAlimento.create({
          data: {
            nome: fromApi.nome,
            marca: fromApi.marca ?? undefined,
            codigoBarras: normalized,
            fonte: 'open_food_facts',
            calorias: fromApi.calorias ?? undefined,
            proteinas: fromApi.proteinas ?? undefined,
            carboidratos: fromApi.carboidratos ?? undefined,
            gorduras: fromApi.gorduras ?? undefined,
            fibras: fromApi.fibras ?? undefined,
            sodio: fromApi.sodio ?? undefined,
            ehUltraprocessado: fromApi.ehUltraprocessado,
            scoreNova: fromApi.scoreNova ?? undefined,
          },
        });
      } catch {
        return null;
      }
    }

    try {
      return await this.findByBarcodeStrict(strict);
    } catch (e) {
      if (e instanceof BarcodeUpstreamError) return null;
      throw e;
    }
  }
}
