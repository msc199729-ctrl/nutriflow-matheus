# Enriquecimento TBCA — Frente 1: micronutrientes completos

## O que é

A base de alimentos do NutriFlow tinha 5.668 alimentos TBCA com apenas **6 nutrientes**
(kcal, proteína, carboidrato, lipídios, fibra, sódio). O dump TBCA que já existia no repo
(`prisma/data/alimentos-tbca.jsonl`) sempre teve o perfil completo — **~35 componentes
por alimento** — mas o seed antigo descartava os demais na gravação.

Este PR adiciona **29 colunas novas** em `base_alimentos` e um script de backfill que
reprocessa o dump, atualizando os alimentos existentes via `codigo_tbca`.

## O que entra (por alimento, por 100g)

| Grupo | Campos |
|---|---|
| Minerais | calcio, ferro, magnesio, fosforo, potassio, zinco, cobre, selenio |
| Vitaminas | vitamina_a_re, vitamina_a_rae, vitamina_d, vitamina_e, tiamina (B1), vitamina_b2, vitamina_b3, vitamina_b6, vitamina_b12, vitamina_c, folato |
| Lipídeos | colesterol, gordura_saturada, gordura_monoinsaturada, gordura_poliinsaturada, gordura_trans |
| Outros | umidade, carboidrato_total, acucar_adicao, sal_adicao, alcool |

Cobertura real dos valores no dump (não-NA): 78–99% por nutriente.

## Arquivos

- `prisma/migrations/20261123193000_add_micros_tbca/migration.sql` — 29 colunas DOUBLE PRECISION
- `prisma/backfill-micros-tbca.ts` — script de backfill (tsx, streaming, batches de 50)
- `prisma/schema.prisma` — model BaseAlimento com os campos novos

## Como aplicar

1. `npx prisma migrate dev` (aplica a migração)
2. `npx prisma generate` (regenera o client com os campos novos — ANTES do backfill)
3. `npx tsx prisma/backfill-micros-tbca.ts` (preenche os 5.668 alimentos)

## Decisões técnicas

- **Colesterol g→mg**: 270 alimentos do dump trazem colesterol em gramas — erro de
  unidade do dump (a TBCA publica em mg). O script converte `g × 1000 → mg`.
- **"NA"/"ND"/"tr" → NULL**: campos sem valor analisado ficam nulos, não zero.
- **updateMany por codigo_tbca**: não toca nos 6 campos antigos nem em alimentos de
  outras fontes (Open Food Facts). Idempotente — pode rodar de novo sem duplicar nada.
- **Backfill separado da migração**: padrão já usado no repo (backfill-medidas.ts etc.).
  A migração só adiciona colunas (instantânea); o backfill é quem grava os dados.

## Validação feita

- SQL validado no parser real do Postgres (pglast): 30 statements, 29 ADD COLUMN + comentários
- Script compilado limpo no TypeScript 5.7 strict (`tsc --noEmit`)
- Dry-run completo contra o dump inteiro (5.668 linhas): parse, batching e conversões OK
- Amostra conferida manualmente contra o dump: Cálcio 14,1 / Ferro 1,92 / Vit. A RE 0,33
  (C0113T Orelha-de-padre) batem exatamente
