import { Injectable } from '@nestjs/common';
import type { BaseAlimento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BarcodeProductProvider } from './barcode-product.types';
import { BarcodeUpstreamError } from './errors/barcode-upstream.error';
import { OpenFoodFactsBarcodeProvider } from './providers/open-food-facts-barcode.provider';
import { sanitizeBarcodeDigits } from './utils/sanitize-barcode';

// ============================================================================
// NORMALIZAÇÃO E TOKENIZAÇÃO
// ============================================================================

function normalizeSearchText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens neutros: não carregam identidade do alimento. */
const NEUTRAL_TOKENS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'ao', 'a', 'o',
  'na', 'no', 'nas', 'nos', 'tipo', 'media', 'pequena', 'pequeno', 'grande',
  'cozido', 'cozida', 'coz', 'cru', 'crua', 'crus', 'cruas',
  'assado', 'assada', 'grelhado', 'grelhada',
  'frito', 'frita', 'refogado', 'refogada', 'preparado', 'preparada',
  'natural', 'unidade', 'unid', 'gramas', 'g', 'ml',
  'sal', 'oleo', 'alho', 'cebola', 'temperado', 'temperada',
  'humano', 'integral', 'semidesnatado', 'desnatado',
]);

/** Variações fortes que NUNCA devem aparecer se não foram pedidas. */
const STRONG_VARIANTS = new Set([
  'po', 'instantaneo', 'soluvel', 'composto', 'composta', 'formula',
  'infantil', 'condensado', 'evaporado', 'creme', 'fermentado',
  'proteico', 'proteica', 'whey', 'suplemento', 'achocolatado',
]);

/**
 * Alimentos que NUNCA devem aparecer na busca clínica, a menos que
 * pedidos explicitamente. Estrutura: { token, requireQuery }
 */
const CLINICAL_BLACKLIST: Array<{ token: string; requireQuery: string }> = [
  // Não-alimentos / contextos clínicos
  { token: 'humano', requireQuery: 'humano' },
  { token: 'racao', requireQuery: 'racao' },
  { token: 'bebe', requireQuery: 'bebe' },
  { token: 'infantil', requireQuery: 'infantil' },

  // Derivados que sequestram busca de carne
  { token: 'linguica', requireQuery: 'linguica' },
  { token: 'salsicha', requireQuery: 'salsicha' },
  { token: 'hamburguer', requireQuery: 'hamburguer' },
  { token: 'industrializado', requireQuery: 'industrializado' },
  { token: 'industrializada', requireQuery: 'industrializado' },
  { token: 'nugget', requireQuery: 'nugget' },
  { token: 'empanado', requireQuery: 'empanado' },
  { token: 'milanesa', requireQuery: 'milanesa' },
  { token: 'bacon', requireQuery: 'bacon' },

  // Miúdos (só aparecem se pedidos)
  { token: 'coracao', requireQuery: 'coracao' },
  { token: 'figado', requireQuery: 'figado' },
  { token: 'moela', requireQuery: 'moela' },

  // Ovos de outras espécies
  { token: 'codorna', requireQuery: 'codorna' },
  { token: 'pata', requireQuery: 'pata' },
  { token: 'gansa', requireQuery: 'gansa' },

  // Laticínios secundários
  { token: 'fermentado', requireQuery: 'fermentado' },
  { token: 'coalhada', requireQuery: 'coalhada' },
];

/**
 * Combinações incompatíveis: se a raiz da busca é X, o token Y é bloqueado
 * quando não foi pedido. Resolve "Arroz com mandioca" em busca de arroz.
 */
const INCOMPATIBLE_WITH: Record<string, string[]> = {
  arroz: ['mandioca', 'macarrao', 'batata', 'carreteiro', 'risoto', 'forno'],
  feijao: ['branco', 'fradinho', 'verde', 'vulgaris'],
  leite: ['po', 'fermentado', 'cafe', 'condensado', 'coco', 'soja', 'aveia', 'bufala', 'cabra'],
  frango: ['hamburguer', 'linguica', 'nugget', 'empanado', 'codorna'],
  ovo: ['codorna', 'pata', 'gansa', 'clara', 'gema'],
};

/** Preparos específicos que indicam prato composto. */
const COMPOSITE_TERMS = new Set([
  'sanduiche', 'hamburguer', 'pizza', 'lasanha', 'strogonoff', 'xadrez',
  'sopa', 'salada', 'torta', 'bolo', 'omelete', 'panqueca', 'molho',
  'recheio', 'recheado', 'recheada', 'cobertura', 'calda', 'caramel',
  'suica', 'milanesa', 'nugget', 'empanado', 'mexido', 'risoto',
  'carreteiro', 'pizzaiolo', 'gratinado', 'escondidinho',
]);

/** Termos de preparo que, se presentes na busca, exigem match. */
const PREP_INTENTS: Record<string, string> = {
  grelhad: 'grelhad',
  cozid: 'cozid',
  assad: 'assad',
  frit: 'frit',
  refog: 'refog',
};

/** Resíduos científicos que escapam da limpeza. */
const SCIENTIFIC_LEFTOVERS = new Set([
  'vulgaris', 'aestivum', 'durum', 'bicolor', 'europaea', 'communis',
  'officinalis', 'sativus', 'esculentum', 'maximum', 'minimum', 'oriza',
  'orysa', 'linn', 'spp', 'sp',
]);

function tokenize(value: string): string[] {
  return normalizeSearchText(value).split(' ').filter(Boolean);
}

/** Tokens que carregam identidade (remove neutros). */
function meaningfulTokens(value: string): string[] {
  return tokenize(value).filter((t) => t.length >= 2 && !NEUTRAL_TOKENS.has(t));
}

/** Primeiro token relevante — a "raiz" do alimento. */
function primaryToken(value: string): string {
  return meaningfulTokens(value)[0] || '';
}

function detectPrepIntent(query: string): string | null {
  const q = normalizeSearchText(query);
  for (const [key, intent] of Object.entries(PREP_INTENTS)) {
    if (q.includes(key)) return intent;
  }
  if (/\bcru(a|s)?\b/.test(q)) return 'cru';
  return null;
}

function isCompositeName(name: string): boolean {
  const tokens = tokenize(name);
  return tokens.some((t) => COMPOSITE_TERMS.has(t));
}

// ============================================================================
// SCORING
// ============================================================================

function rootScore(nomeBusca: string, query: string): number {
  const name = normalizeSearchText(nomeBusca);
  const q = normalizeSearchText(query);
  const primary = primaryToken(query);
  if (!primary) return 0;

  if (name === q) return 80;
  if (name.startsWith(q)) return 65;
  if (name.startsWith(primary)) return 45;

  const nameFirst = primaryToken(nomeBusca);
  if (nameFirst && nameFirst === primary) return 35;

  if (name.includes(` ${primary} `) || name.includes(` ${primary},`)) {
    return -35;
  }
  return -60;
}

function specificityWeight(token: string): number {
  const strong = new Set([
    'integral', 'desnatado', 'semidesnatado', 'zero', 'diet', 'light',
    'selvagem', 'parboilizado', 'arboreo', 'cateto', 'negro', 'vermelho',
    'prata', 'nanica', 'maca', 'terra', 'coco', 'carreteiro', 'forno',
    'risoto', 'macarrao', 'queijo', 'recheado', 'recheada', 'temperado',
    'temperada', 'oleo', 'alho', 'cebola', 'molho', 'creme', 'acucar',
    'mel', 'calda', 'chocolate', 'morango', 'baunilha', 'castanha',
    'amendoim', 'aveia', 'granola', 'whey', 'proteico', 'proteica',
  ]);
  return strong.has(token) ? 18 : 6;
}

function directnessScore(nomeBusca: string, query: string): number {
  const name = normalizeSearchText(nomeBusca);
  const foodTokens = tokenize(nomeBusca);
  const relevant = meaningfulTokens(nomeBusca);
  const requested = meaningfulTokens(query);

  if (!requested.length || !foodTokens.length || !relevant.length) {
    return -999999;
  }

  const main = requested[0];
  const firstRelevant = relevant[0] || '';
  let score = 0;

  if (firstRelevant === main) score += 10000;
  else score -= 10000;

  for (const token of requested) {
    if (foodTokens.includes(token)) score += 1000;
    else score -= 5000;
  }

  const compactRequested = requested.join(' ');
  if (name === compactRequested) score += 3000;
  if (name.startsWith(compactRequested + ' ')) score += 2200;
  if (name.startsWith(main + ' ')) score += 1000;

  if (foodTokens.includes('tipo') && foodTokens.includes('1')) score += 260;
  if (foodTokens.includes('branco') && !requested.includes('branco')) score += 400;
  if (foodTokens.includes('tradicional') && !requested.includes('tradicional')) {score += 140;
  }

  const requestedSet = new Set(requested);
  const extras = relevant.filter((t, i) => {
    if (i === 0 && requestedSet.has(t)) return false;
    return !requestedSet.has(t);
  });
  let penalty = 0;
  for (const token of extras) {
    penalty += specificityWeight(token);
  }
  score -= penalty * 100;

  score -= Math.min(foodTokens.length, 30) * 3;
  return score;
}

function compositePenalty(nomeBusca: string): number {
  const tokens = tokenize(nomeBusca);
  let penalty = 0;
  for (const t of tokens) {
    if (COMPOSITE_TERMS.has(t)) penalty += 700;
  }
  return penalty;
}

// ============================================================================
// FILTROS
// ============================================================================

function containsAllRequested(nomeBusca: string, query: string): boolean {
  const requested = meaningfulTokens(query);
  if (requested.length <= 1) return true;
  const foodTokens = tokenize(nomeBusca);
  return requested.every((t) => foodTokens.includes(t));
}

function hasUnrequestedStrongVariant(nomeBusca: string, query: string): boolean {
  const requested = new Set(meaningfulTokens(query));
  const foodTokens = tokenize(nomeBusca);
  return foodTokens.some((t) => STRONG_VARIANTS.has(t) && !requested.has(t));
}

function matchesPrepIntent(nomeBusca: string, prepIntent: string | null): boolean {
  if (!prepIntent) return true;
  const n = normalizeSearchText(nomeBusca);
  if (prepIntent === 'cru') return /\bcru(a|s)?\b/.test(n);
  return n.includes(prepIntent);
}

function hasIncompatibleToken(nomeBusca: string, query: string): boolean {
  const root = primaryToken(nomeBusca);
  const incompat = INCOMPATIBLE_WITH[root];
  if (!incompat || !incompat.length) return false;

  const requestedSet = new Set(meaningfulTokens(query));
  const foodTokens = tokenize(nomeBusca);

  return incompat.some(
    (t) => foodTokens.includes(t) && !requestedSet.has(t),
  );
}

// ============================================================================
// LIMPEZA DE NOME PARA EXIBIÇÃO
// ============================================================================

export function limparNomeAlimento(nomeOriginal: string): string {
  let nome = nomeOriginal.trim();

  nome = nome.replace(
    /,?\s*[A-Z][a-z]+ [a-z]+(\s+(var|subsp|ssp)\.\s+[a-z]+)?\.?\s*$/i,
    '',
  );

  const partes = nome.split(',').map((p) => p.trim()).filter(Boolean);

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

  const parteQualif = qualificadores.length ? `${qualificadores.join(' ')} de ` : '';
  const partePrep = preparacoes.length ? ` ${preparacoes.join(', ')}` : '';

  const resultado = `${parteQualif}${principal.toLowerCase()}${partePrep}`;
  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

// ============================================================================
// NORMALIZAÇÃO COMPLETA (barcode / novos alimentos)
// ============================================================================

const CIENTIFICOS = new Set([
  'gallus', 'gallus gallus', 'bos', 'bos taurus', 'sus', 'sus scrofa',
  'zea', 'zea mays', 'zea may', 'oryza', 'oryza sativa', 'lablab',
  'lablab purpureus', 'glycine', 'glycine max', 'phaseolus', 'brassica',
  'solanum', 'malus', 'musa', 'citrus', 'lactuca', 'daucus', 'allium',
  'capsicum', 'cucumis', 'cucurbita', 'ipomoea', 'manihot', 'saccharum',
  'coffea', 'theobroma', 'psidium', 'carica', 'passiflora', 'mangifera',
  'vitis', 'prunus', 'pyrus', 'fragaria', 'rubus', 'avena', 'triticum',
  'hordeum', 'secale', 'pennisetum', 'sorghum', 'cichla', 'oreochromis',
  'salmo', 'ocellaris', 'purpureus', 'sativa', 'sativum', 'domesticus',
  'taurus', 'scrofa', 'mays', 'may', 'spp', 'l', 'sweet', 'linn',
  'var', 'subsp', 'ssp', 'vulgaris', 'aestivum', 'durum', 'bicolor',
  'europaea', 'communis', 'officinalis', 'sativus', 'esculentum',
  'maximum', 'minimum',
]);

function removerCientificos(texto: string): string {
  const palavras = texto.split(' ');
  const resultado: string[] = [];
  let i = 0;

  while (i < palavras.length) {
    const atual = palavras[i].toLowerCase().replace(/\.$/, '');
    const proxima = palavras[i + 1]?.toLowerCase().replace(/\.$/, '');

    if (proxima && CIENTIFICOS.has(atual) && CIENTIFICOS.has(proxima)) {
      i += 2;
      continue;
    }
    if (CIENTIFICOS.has(atual)) {
      i += 1;
      continue;
    }
    resultado.push(palavras[i]);
    i += 1;
  }
  return resultado.join(' ');
}

export function limparNomeCompleto(nome: string): {
  exibicao: string;
  busca: string;
} {
  let s = nome;

  let antes;
  do {
    antes = s;
    s = s.replace(/\([^()]*\)/g, ' ');
  } while (s !== antes);
  s = s.replace(/\(.*$/, ' ');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/\bc\//gi, 'com ');
  s = s.replace(/\bs\//gi, 'sem ');
  s = s.replace(/[,/;()]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = removerCientificos(s);
  s = s.replace(/\s+/g, ' ').replace(/[,;:\-\s]+$/, '').trim();
  s = s.replace(/\s+(com|sem|e|de|da|do)$/i, '').trim();

  const exibicao = s.charAt(0).toUpperCase() + s.slice(1);
  const busca = normalizeSearchText(exibicao);

  return { exibicao, busca };
}

// ============================================================================
// SERVICE
// ============================================================================

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
  alimento: { nome: string; nomeExibicao?: string | null; [key: string]: unknown },
  opts?: { preserveOriginalNameOrder?: boolean },
) {
  const nomeExibicao =
    alimento.nomeExibicao ??
    (opts?.preserveOriginalNameOrder
      ? alimento.nome
      : limparNomeAlimento(alimento.nome));

  const medidasRaw =
    (alimento as { medidasCaseiras?: Array<{ id: string; nome: string; gramas: unknown; padrao: boolean; ordem: number }> })
      .medidasCaseiras ?? [];

  const medidasCaseiras = medidasRaw.map((m) => ({
    id: m.id,
    nome: m.nome,
    gramas: Number(m.gramas),
    padrao: m.padrao,
    ordem: m.ordem,
  }));

  return { ...alimento, nomeExibicao, medidasCaseiras };
}

  /**
   * Busca de alimentos — pipeline com filtros progressivos + ranking.
   */
  async searchByText(texto: string, limit = 50) {
    const term = String(texto || '').trim();
    if (!term) return [];

    const normalizedTerm = normalizeSearchText(term);
    if (!normalizedTerm) return [];

    const requestedTokens = meaningfulTokens(term);
    if (!requestedTokens.length) return [];

    const prepIntent = detectPrepIntent(term);
    const multiTerm = requestedTokens.length >= 2;

const rows = await this.prisma.baseAlimento.findMany({
  include: {
    medidasCaseiras: {
      orderBy: [{ padrao: 'desc' }, { ordem: 'asc' }],
      select: { id: true, nome: true, gramas: true, padrao: true, ordem: true },
    },
  },
});
    // ---------- FASE 1: filtro mínimo ----------
    const base = rows.filter((row) => {
      const nomeBusca = row.nomeBusca ?? normalizeSearchText(row.nome);

      // 0. blacklist clínica
      for (const rule of CLINICAL_BLACKLIST) {
        if (
          normalizeSearchText(nomeBusca).includes(rule.token) &&
          !normalizedTerm.includes(rule.requireQuery)
        ) {
          return false;
        }
      }

      // 1. precisa conter ao menos um termo relevante
      const foodTokens = tokenize(nomeBusca);
      const temAlgumTermo = requestedTokens.some((t) => foodTokens.includes(t));
      if (!temAlgumTermo) return false;

      // 2. preparo: se pediu cozido/grelhado/assado, rejeita cru
      if (prepIntent && prepIntent !== 'cru') {
        const nomeNorm = normalizeSearchText(nomeBusca);
        if (/\bcru(a|s)?\b/.test(nomeNorm)) return false;
      }
      if (!matchesPrepIntent(nomeBusca, prepIntent)) return false;

      // 3. incompatibilidades (arroz + mandioca, etc.)
      if (hasIncompatibleToken(nomeBusca, term)) return false;

      // 4. resíduos científicos na exibição
      const exibicaoNormalizada = normalizeSearchText(
        row.nomeExibicao ?? row.nome,
      );
      const displayTokens = exibicaoNormalizada.split(' ');
      if (displayTokens.some((t) => SCIENTIFIC_LEFTOVERS.has(t))) return false;

      return true;
    });

    // ---------- FASE 1.5: refino progressivo ----------
    let pool = base;
    if (multiTerm) {
      const completos = base.filter((row) => {
        const nomeBusca = row.nomeBusca ?? normalizeSearchText(row.nome);
        return containsAllRequested(nomeBusca, term);
      });
      if (completos.length > 0) pool = completos;
    }

    // ---------- FASE 2: ranking ----------
    const scored = pool
      .map((row) => {
        const nomeBusca = row.nomeBusca ?? normalizeSearchText(row.nome);
        const nomeExibicao = row.nomeExibicao ?? row.nome;

        const root = rootScore(nomeBusca, term);
        const direct = directnessScore(nomeBusca, term);
        const composite = compositePenalty(nomeBusca);

        const mainRoot = requestedTokens[0];
        const firstFoodToken = primaryToken(nomeBusca);
        const mainRootBonus = firstFoodToken === mainRoot ? 2000 : 0;

        const foodRelevant = meaningfulTokens(nomeBusca);
        const requestedSet = new Set(requestedTokens);
        const extras = foodRelevant.filter((t) => !requestedSet.has(t));
        const extrasPenalty = extras.length * 900;

        const tokenCount = tokenize(nomeBusca).length;
        const brevityBonus = Math.max(0, 400 - tokenCount * 40);

        const compositeHardPenalty = isCompositeName(nomeExibicao) ? 2500 : 0;

        return {
          row,
          score:
            root * 10 +
            direct +
            mainRootBonus +
            brevityBonus -
            extrasPenalty -
            composite -
            compositeHardPenalty,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => this.formatAlimento(item.row));

    return scored;
  }

  async findByBarcodeStrict(
    sanitizedDigits: string,
  ): Promise<BaseAlimento | null> {
    const local = await this.prisma.baseAlimento.findUnique({
      where: { codigoBarras: sanitizedDigits },
    });
    if (local) return local;

    const fromApi = await this.barcodeProvider.fetchByBarcode(sanitizedDigits);
    if (!fromApi) return null;

    const { exibicao, busca } = limparNomeCompleto(fromApi.nome);

    return this.prisma.baseAlimento.create({
      data: {
        nome: fromApi.nome,
        nomeExibicao: exibicao,
        nomeBusca: busca,
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

        const { exibicao, busca } = limparNomeCompleto(fromApi.nome);

        return this.prisma.baseAlimento.create({
          data: {
            nome: fromApi.nome,
            nomeExibicao: exibicao,
            nomeBusca: busca,
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