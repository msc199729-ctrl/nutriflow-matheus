import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrl } from './db-url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

// ===== CONFIG =====
const DRY_RUN = false; // ← true = só mostra | false = grava
// ==================

/** Normaliza para busca (sem acento, minúsculo). */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resíduos científicos e abreviações de autoria botânica. */
const CIENTIFICOS = [
  'vulgaris', 'aestivum', 'durum', 'bicolor', 'europaea', 'communis',
  'officinalis', 'sativus', 'esculentum', 'maximum', 'minimum',
  'gallus', 'taurus', 'scrofa', 'sativa', 'linn', 'spp',
  'linne', 'jacq', 'mart', 'walp', 'blanco', 'osbeck',
  'swing', 'crantz', 'lam', 'merr', 'merril', 'mill', 'spreng',
];

/**
 * Detecta se o nome precisa de limpeza.
 * Vírgula final e "c//s/" são o PADRÃO da TACO — não contam como sujeira.
 * Só dispara em evidência concreta: parênteses, colchetes, vírgula dupla,
 * resíduo científico ou descritivo de amostra.
 */
function precisaLimpar(nome: string): boolean {
  if (/\(/.test(nome) || /\)/.test(nome)) return true;
  if (/\[|\]/.test(nome)) return true;
  if (/,\s*,/.test(nome)) return true;
  if (/media de diferentes|media das amostras|valores medios/i.test(nome)) return true;

  const palavras = normalizar(nome).split(' ');
  if (palavras.some((p) => CIENTIFICOS.includes(p))) return true;

  return false;
}

/** Limpa um nome sujo. */
function limpar(nome: string): string {
  let s = nome;

  // remove parênteses, colchetes (inclusive aninhados)
  let antes: string;
  do {
    antes = s;
    s = s.replace(/\([^()]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  } while (s !== antes && s.length > 0);
  // parêntese aberto sem fechamento
  s = s.replace(/\(.*$/, ' ');

  // abreviações
  s = s.replace(/\bc\//gi, 'com ').replace(/\bs\//gi, 'sem ');

  // descritivos de amostra
  s = s.replace(/media de diferentes (amostras|valores)/gi, ' ');
  s = s.replace(/media das amostras/gi, ' ');
  s = s.replace(/valores medios/gi, ' ');

  // pontuação vira espaço
  s = s.replace(/[,/;:]+/g, ' ');

  // remove resíduos científicos (binômios e tokens isolados)
  const set = new Set(CIENTIFICOS);
  const palavras = s.split(/\s+/).filter(Boolean);
  const filtradas: string[] = [];
  let i = 0;
  while (i < palavras.length) {
    const atual = palavras[i].toLowerCase().replace(/\.$/, '');
    const prox = palavras[i + 1]?.toLowerCase().replace(/\.$/, '');
    if (prox && set.has(atual) && set.has(prox)) {
      i += 2;
      continue;
    }
    if (set.has(atual)) {
      i += 1;
      continue;
    }
    filtradas.push(palavras[i]);
    i += 1;
  }

  s = filtradas.join(' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^\s*[,;:.\-\s]+|[,;:.\-\s]+$/g, '').trim();
  s = s.replace(/\s+(com|sem|e|de|da|do)$/i, '').trim();

  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Os 42 canônicos — nunca sobrescrever. */
const CANONICOS_PROTEGIDOS = new Set([
  'frango peito grelhado sem pele', 'frango peito cozido sem pele',
  'frango coxa cozida sem pele', 'frango sobrecoxa assada sem pele',
  'ovo de galinha cozido', 'ovo de galinha frito',
  'carne bovina patinho grelhado sem gordura',
  'carne bovina acem cozido sem gordura', 'carne suina lombo assado',
  'peixe tilapia grelhada', 'peixe salmao grelhado', 'atum em agua drenado',
  'arroz branco cozido', 'arroz integral cozido',
  'feijao carioca cozido', 'feijao preto cozido', 'lentilha cozida',
  'batata doce cozida', 'batata inglesa cozida', 'mandioca cozida',
  'macarrao cozido', 'aveia em flocos', 'pao frances',
  'pao de forma integral', 'tapioca', 'banana prata', 'banana nanica',
  'maca com casca', 'mamao papaia', 'laranja pera', 'morango',
  'leite de vaca integral', 'leite de vaca desnatado',
  'iogurte natural integral', 'azeite de oliva extra virgem',
  'oleo de soja', 'castanha do para', 'amendoa', 'brocolis cozido',
  'tomate cru', 'cenoura crua', 'alface crespa',
]);

async function main() {
  console.log('Carregando alimentos...');
  const todos = await prisma.baseAlimento.findMany({
    select: { id: true, nome: true, nomeExibicao: true, nomeBusca: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Total na base: ${todos.length}\n`);

  const candidatos = todos.filter(
    (a) =>
      precisaLimpar(a.nome) &&
      !CANONICOS_PROTEGIDOS.has(a.nomeBusca ?? ''),
  );

  console.log(`Precisam de limpeza: ${candidatos.length}\n`);

  if (DRY_RUN) console.log('=== DRY RUN — NÃO GRAVA ===\n');

  let alterados = 0;
  let pulados = 0;

  for (const a of candidatos) {
    const exibicaoNova = limpar(a.nome);
    const buscaNova = normalizar(exibicaoNova);

    // segurança: resultado vazio ou curto demais
    if (!exibicaoNova || exibicaoNova.length < 3) {
      console.log(`⚠️  Resultado inválido, pulando id ${a.id}: "${a.nome}"`);
      pulados++;
      continue;
    }

    // segurança: não mudou
    if (exibicaoNova === a.nome) continue;

    // segurança: parêntese residual
    if (/[()]/.test(exibicaoNova)) {
      console.log(`⚠️  Parêntese residual, pulando id ${a.id}: "${a.nome}"`);
      pulados++;
      continue;
    }

        // segurança: nome duplicado de verdade (a fonte repete a descrição inteira)
    if (exibicaoNova.length > 120) {
      const metade = Math.floor(exibicaoNova.length / 2);
      const inicio = exibicaoNova.slice(0, metade).trim();
      const resto = exibicaoNova.slice(metade).trim();
      if (resto.includes(inicio.slice(0, 40))) {
        console.log(`⚠️  Nome duplicado, pulando id ${a.id}`);
        pulados++;
        continue;
      }
    }

    console.log(`id ${a.id}:`);
    console.log(`  "${a.nome}"`);
    console.log(`  → "${exibicaoNova}"`);

    if (!DRY_RUN) {
      await prisma.baseAlimento.update({
        where: { id: a.id },
        data: { nomeExibicao: exibicaoNova, nomeBusca: buscaNova },
      });
      alterados++;
    }
  }

  if (DRY_RUN) {
    console.log('\n=== Fim do dry run ===');
    console.log(`Pulados por segurança: ${pulados}`);
    console.log('Se estiver bom, troque DRY_RUN para false.');
  } else {
    console.log(`\n✅ ${alterados} alimentos atualizados, ${pulados} pulados.`);
  }

  await prisma.$disconnect();
}

main();