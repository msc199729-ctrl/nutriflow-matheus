# Enriquecimento NutriFlow — Frentes 2 e 3

## Frente 2: industrializados brasileiros (Open Food Facts)

### Resultado real (medido, não estimado)

O export mundial do OFF (13,8 GB, 4,9 milhões de produtos) tem **40.097 produtos
brasileiros**, mas apenas **176 têm tabela nutricional completa** (kcal + proteína +
carboidrato + gordura digitados). O resto são cadastros com foto de rótulo, sem
dados estruturados. O número "38.715" que a busca do OFF anuncia conta produtos
com QUALQUER nutriente preenchido — quase sempre só um campo isolado.

**Conclusão honesta:** o OFF Brasil, hoje, não serve como fonte de industrializados
em massa. Os 176 produtos completos foram incluídos, e o caminho recomendado para
o resto é o que o NutriFlow já faz: **scan de código de barras on-demand** — quando
o nutri escaneia, o produto entra com os dados do rótulo, e a base cresce a cada uso.

### O que foi entregue

- `prisma/import-off-br.ts` — importador (dedupe por codigo_barras, upsert,
  NOVA score, nome de exibição "Produto — Marca", nome_busca normalizado)
- `prisma/data/off-br-slim.jsonl` — os 176 produtos BR completos, prontos pra importar

## Frente 3: medidas caseiras da TBCA

### Resultado

Scrape completo da base oficial "Composição de Alimentos em Medidas Caseiras"
(tbca.net.br): **5.800 alimentos varridos, 5.142 com medidas caseiras**,
**7.449 medidas** no total (média 1,4/alimento).

Distribuição: Pedaço/Unidade/Fatia (M) 1.731 · Colher de servir cheia 1.263 ·
Porção média 935 · Colher de sopa cheia 893 · Colher de sopa rasa 643 ·
Colher de servir rasa 389 · Unidade média 211 · Concha cheia 210 ·
Escumadeira cheia 180 · Escumadeira rasa 178 · e mais.

Os utensílios seguem a metodologia oficial da TBCA (copo americano 180 mL,
colher de sopa 11 mL, concha média 150 mL etc. — tbca.net.br).

### O que foi entregue

- `prisma/import-medidas-tbca.ts` — importador: liga cada medida ao alimento por
  `codigo_tbca`, upsert pela constraint única (alimentoId, nome), primeira medida
  vira padrão do dropdown, nomes normalizados ("Colher sopa cheia" →
  "Colher de sopa cheia", "Pedaço/Unidade/Fatia (M)" → "Unidade/Fatia (média)")
- **`medidas-tbca.json`** — o scrape completo (439 KB). Por ser grande, NÃO está no
  repo: é entregue como arquivo separado. Salvar em `prisma/data/medidas-tbca.json`.
  O importador também aceita qualquer caminho como argumento:
  `npx tsx prisma/import-medidas-tbca.ts <caminho>`.

## Como aplicar (no PC, na pasta do projeto)

1. Salvar o arquivo `medidas-tbca.json` (entregue separadamente) em `prisma/data/`
2. Rodar:
```
npx tsx prisma/import-medidas-tbca.ts
npx tsx prisma/import-off-br.ts
```

(Nenhuma migração nova — Frente 3 usa a tabela MedidaCaseira que já existe,
Frente 2 só insere linhas em base_alimentos. `prisma generate` já foi feito na Frente 1.)

Final esperado do import de medidas:
```
Import medidas TBCA concluído.
  Alimentos processados: 5142
  Medidas criadas: ~7449
  Medidas atualizadas: 0
  Alimentos sem match no banco: 0
  Alimentos sem medidas no scrape: 658
```

Final esperado do import do OFF:
```
Import OFF BR concluído.
  Produtos lidos: 176
  Criados: 176
  Atualizados: 0
```

## Decisões técnicas

- **Scrape respeitoso**: 4 workers, 0,25s de pausa por página, cache local de
  tudo (re-execução não refaz o que já baixou). Fonte pública da USP.
- **Medida padrão**: a primeira da lista da TBCA (ordem original do site) —
  geralmente a medida mais usada na prescrição.
- **OFF on-demand**: o importador marca `fonte: 'Open Food Facts'` e o fluxo de
  barcode existente continua funcionando — novos scans enriquecem a base com o
  tempo (rede colaborativa).
- **Dedupe OFF**: upsert por `codigo_barras` — rodar de novo atualiza em vez de duplicar.

## Validação

- Scrape TBCA: 5.800/5.800 páginas OK, regex validada contra exemplo conhecido
  (abóbora cozida: Colher sopa cheia 36g, Escumadeira cheia 100g, Fatia (M) 50g)
- Filtro OFF: export completo (4.929.984 linhas) processado, pré-filtro por
  substring + parse JSON só nos BR
- Importadores: TypeScript compilado limpo (`tsc --noEmit` strict)
