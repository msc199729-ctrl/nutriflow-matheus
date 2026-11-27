# Patch do check-in (varredura 06, itens 4-6)

Aplica por cima do `main`. Dois commits, testados contra o repositório:

```
git pull origin main
git am --3way docs/patches/checkin-2711.patch
npx prisma generate
```

Depois disso o `npm run start:dev` sobe com as rotas novas.

O `-3way` importa: ele aplica mesmo que o arquivo tenha mudado um pouco, e
para com conflito visível em vez de recusar o patch inteiro.

## O que entra

- `formulario-tipos.ts` (novo): lista fechada de tipos de resposta
  (`texto`, `numero`, `escala` 1-10, `multipla_escolha`, `sim_nao`) e as regras
  de validação de pergunta e de resposta.
- `respostas.ts` (novo): caminho único de gravação de respostas, usado pelo link
  público e pela rota autenticada. Antes o link validava e a rota autenticada
  não — dava para fechar um envio com pergunta obrigatória em branco.
- Fila de pendências: `GET /formularios/pendencias` e
  `POST /formularios/pendencias/revisar`, com a coluna `envios_formulario.revisado_em`.
- Explicação obrigatória: `opcoes_json` aceita
  `[{ "rotulo": "...", "exigeExplicacao": true }]` e a resposta grava em
  `respostas.explicacao`. `string[]` continua funcionando para os modelos
  antigos.
- Migração `20261127230000_add_revisao_e_explicacao` (idempotente).

## Banco

A migração **já foi aplicada** no Supabase `wdzbmnztatfumbntcodo`: as colunas
`revisado_em` e `explicacao` e os dois índices existem. O `prisma migrate deploy`
não é necessário; basta o `generate` para o client conhecer as colunas.

## O que ainda não tem tela

- Aba "Pendências" no painel (`/dashboard/check-ins`).
- Checkbox "exige explicação" por alternativa no construtor.
- Campo de comentário na página pública `/f/[token]`.

A API está pronta para as três; o painel ainda não as consome.
