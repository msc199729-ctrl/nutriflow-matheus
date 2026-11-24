# NutriFlow — leitura geral, o que melhorar e o que copiar do mercado

**Data:** 24/11/2026
**Escopo:** leitura do código dos repos `nutriflow-backend` e `nutriflow-frontend`, diagnóstico de bugs, entrega da frente de micronutrientes e comparação com WebDiet, Dietbox, Nutrium, Cronometer e Avanutri.
**Como ler:** todo item marcado **[verificado]** foi conferido no código ou em fonte citada. O que é opinião ou estimativa está marcado **[inferência]**.

---

## 1. O que o NutriFlow é hoje, em uma página

| Camada | Estado |
|---|---|
| Backend | NestJS 11 + Prisma 7 + Postgres. Multi-tenant por `workspace`. JWT + perfis (`nutricionista`, `admin_clinica`, `admin_sistema`, `paciente`). Swagger em `/api/docs`. |
| Frontend | Next.js 16.4.6 (App Router), app "ONutri", porta 3001. React Query + Zustand. |
| Banco de alimentos | TBCA com **5.668 alimentos**, `codigoTbca`, classe, e **7.244 medidas caseiras** importadas (7.215 criadas + 29 atualizadas em 4.948 alimentos). |
| Cálculo energético | Mifflin-St Jeor, Harris-Benedict, EER (IOM 2005/2023), TMB/GET manual. Fatores de atividade e injúria, adicionais MET/VENTA/gestante. |
| Planos alimentares | Por alimentos e qualitativo. Refeições, itens, medida caseira, "à vontade", grupo de substituição. |
| Já pronto e subutilizado | `GET /planos-alimentares/:id/shopping-list` (lista de compras consolidada) e `GET /planos-alimentares/:id/resumo` (prescrito × alvo) **existem no backend e não têm tela**. |
| Nutrientes | Só 6: calorias, proteínas, carboidratos, gorduras, fibras, sódio. |
| App do paciente | Existe repo (`nutriflow-app-mobile`), não faz parte do fluxo atual. |

**Leitura honesta:** o motor de prescrição está bom. O que falta é a camada que transforma prescrição em produto — nutriente completo, entrega ao paciente (PDF/lista de compras) e o pós-consulta. E há bugs que quebram funcionalidades que parecem prontas.

---

## 2. Bugs e riscos — em ordem de gravidade

### 2.1 Crítico: salvar plano pelo gerador provavelmente retorna 400

**[verificado]** O `main.ts` configura `ValidationPipe` com `whitelist: true` **e** `forbidNonWhitelisted: true`. Isso significa que **qualquer campo não declarado no DTO faz a requisição inteira falhar**.

O `serializarRefeicoes` do frontend envia, por item:
`idMedidaCaseira`, `quantidadeMedida`, `substitutos` — e, por substituto, `idAlimento`, `quantidadeGramas`, `medidaCaseira`, `idMedidaCaseira`, `quantidadeMedida`, `aVontade`, `ordem`.

O `CreateItemPlanoDto` declara apenas: `idAlimento`, `quantidadeGramas`, `medidaCaseira`, `aVontade`, `idGrupoSubstituicao`.

→ Os demais campos não estão no DTO. Com `forbidNonWhitelisted`, a resposta tende a ser **400 Bad Request**. Vale testar salvando uma dieta com medida caseira pelo gerador: é o primeiro teste a fazer.

**Correção:** adicionar ao DTO `idMedidaCaseira`, `quantidadeMedida` e `substitutos` (com DTO aninhado e `@ValidateNested`), e — se o objetivo é permitir que campos extras passem sem quebrar — trocar `forbidNonWhitelisted` por `false`. A troca às cegas é arriscada: ela silencia erro de contrato. Prefira declarar os campos.

### 2.2 Crítico: substituições não chegam ao banco

**[verificado]** Não existe tabela nem campo para substitutos no schema. `ItemDieta` tem `idGrupoSubstituicao` (um inteiro de grupo), mas nenhuma relação de itens substitutos. O próprio código do frontend comenta: *"sem isso eles existem na tela e não chegam ao banco"*.

→ Toda substituição montada no gerador é **perdida ao salvar**. É a funcionalidade que mais diferencia um plano alimentar na prática clínica.

**Correção:** model `SubstitutoItem` (idItemDieta, idAlimento, quantidadeGramas, medidaCaseira, idMedidaCaseira, quantidadeMedida, aVontade, ordem) + escrita no `createPlanoNutricionista` + leitura no `findOnePlano`.

### 2.3 Alto: o plano salvo não devolve as medidas caseiras

**[verificado]** `findOnePlano` retorna `alimento: { id, nome }` — sem macros, sem medidas caseiras. O frontend espera `medidasCaseiras` na resposta (`PlanoAlimentarItemDieta`). Ao reabrir um plano, o seletor de porção volta vazio e as macros do item somem.

**Correção:** incluir no select os 6 macros + as medidas caseiras do alimento.

### 2.4 Alto: busca de alimentos carrega os 5.668 registros a cada tecla

**[verificado]** `FoodsService.searchByText` faz `await this.prisma.baseAlimento.findMany()` — **sem filtro** — e ordena em memória. Cada busca transfere a tabela inteira do Postgres para o Node.

Hoje passa porque 5.668 linhas é pouco. Mas: (a) o `/alimentos/busca` é chamado com 2 caracteres; (b) com as 23 colunas novas, cada linha fica ~5× maior; (c) o catálogo já é baixado inteiro no cliente por outro endpoint.

**Correção:** índice GIN com `pg_trgm` + `unaccent`, e `WHERE nome ILIKE ... LIMIT 50` no banco. Ganho de ordem de magnitude e uma tabela que não cresce no heap do Node.

### 2.5 Alto: "Importar da avaliação" nunca aparece

**[verificado]** `CalculoEnergeticoTab` recebe a prop opcional `antropometria` e só renderiza o botão se ela vier preenchida. A página que monta o componente (`dashboard/pacientes/[id]/[aba]/page.tsx`) **não passa a prop**. O botão nunca é renderizado — não é bug de clique, é código morto.

**Correção:** buscar `avaliacoesFisicasService.list(id)` na página e passar `{ pesoKg, alturaCm, massaMagraKg }`. Atenção: no banco `altura` é **metros**; o componente espera **cm**. E `biaMassaMuscularKg` é massa *muscular*, não massa livre de gordura — subestima a MLG.

### 2.6 Alto: a meta de macros não persiste

**[verificado]** `DEFAULT_MACRO_TARGETS` é uma constante fixa (1800 kcal / 225 C / 135 P / 50 G). `calculoEnergeticoService.salvarDistribuicao` existe no frontend mas **nunca é chamado** por nenhum componente. O "Salvar cálculos" da aba não envia `proteinasGKg`/`lipidiosGKg`/`carboidratosGKg`.

→ A distribuição de macros vive só no estado React. Recarregar a página devolve 1800/225/135. Todo painel de adequação herda esse erro.

**Correção:** colunas no `CalculoEnergetico` + enviar os três g/kg no salvar + ler no `useDietBuilder`. A migração de hoje já cria as colunas (condicionalmente, porque a tabela não está no repo remoto).

### 2.7 Médio: `/resumo` usa alvo fixo de 20/55/25

**[verificado]** `getResumoComparativo` calcula o alvo com Mifflin × **1,55 fixo** e distribuição **20/55/25 fixa**, ignorando o cálculo energético salvo do paciente. Um plano montado com GET diferente aparece como "fora do alvo".

**Correção:** ler o `CalculoEnergetico` do paciente e usar GET + distribuição reais; só cair no 1,55 quando não houver cálculo.

### 2.8 Médio: inconsistência entre repo remoto e cópia local

**[verificado]** O `main` do backend só tem `/alimentos/busca` e `/alimentos/codigo-barras`. O frontend chama `/alimentos/catalogo`, `/alimentos/mais-usados` e `PATCH /alimentos/:id/nome`. O módulo de cálculo energético e o array `medidasCaseiras` também não estão no repo.

→ Quem clonar o repositório não reproduz o sistema. Hoje isso já custa tempo em toda conversa.

**Correção:** commitar e enviar o trabalho local. Enquanto não fizer, o código só existe em uma máquina.

---

## 3. O que foi entregue hoje: micronutrientes

### 3.1 A descoberta que decidiu o desenho

O dump `alimentos-tbca.jsonl` tem **39 componentes**, não 35 — e três defeitos que precisam de tratamento:

| Defeito | Ocorrências | Tratamento |
|---|---|---|
| Ausência vem como `-` (além de `NA`, `ND`, `tr`) | 20 valores em 12 nutrientes | `-` → `null`, nunca 0 |
| Colesterol com unidade `g` mas valor em `mg` | 269 linhas | interpretado como mg |
| Ácido graxo maior que o total de lipídios | 34 linhas | valor anulado (impossível fisicamente) |
| **Soma** dos ácidos graxos maior que os lipídios | 46 linhas | quatro ácidos anulados |
| Valores acima do teto de sanidade (ex.: ferro 907 mg/100 g) | 19 linhas | valor anulado |

Sem isso, o painel mostraria vitaminas artificialmente baixas e um hambúrguer com 907 mg de ferro.

### 3.2 Os 23 nutrientes escolhidos

**Minerais (8):** cálcio, ferro, magnésio, fósforo, potássio, zinco, cobre, selênio.
**Vitaminas (10):** A (RAE), C, D, E, B1, B2, B3, B6, B12, folato.
**Gorduras (5):** saturados, monoinsaturados, poliinsaturados, trans, colesterol.

**Fora, e por quê:** a TBCA não traz vitamina K, B5, biotina, manganês, cromo nem iodo. Não é escolha — não existe dado na fonte.

**Fibras e sódio ficam fora do painel novo** porque já aparecem no painel de macros. Duas telas com o mesmo número confundem.

### 3.3 Decisão de arquitetura: cálculo no servidor

O catálogo já é baixado inteiro no cliente (`/alimentos/catalogo`, ~1,5 MB). Se cada alimento carregasse 23 micronutrientes, o payload iria para **4,6 MB (~200% de aumento)** — a cada sessão, em qualquer máquina.

O caminho escolhido: **o servidor agrega e devolve 23 linhas**. Payload da aba: alguns KB. O endpoint novo faz **uma única consulta** ao plano com os alimentos, em vez de uma por item.

### 3.4 Validação executada

- Compilação em TypeScript `strict` sem erros (`tsc --noEmit`).
- Agregação testada com um dia de dieta real: 23 nutrientes, agrupamento, faixas, arredondamento.
- Referências testadas para homem 30, mulher 28, mulher 58, gestante e homem 75 — todas mudam no ponto certo (ferro 18→8, cálcio 1000→1200, vitamina D 15→20).
- Importador simulado nas **5.668 linhas reais**: **92,9% de preenchimento**, 146 valores descartados de 130.364 (0,11%).
- Mapeamento TBCA → banco: **23 de 23 nutrientes casam**, cobertura de 82,2% (selênio) a 99,9% (potássio).

### 3.5 Limitações que ficam visíveis na tela

- **Niacina** da TBCA é mg total; a DRI é mg NE. Aproximação, sinalizada.
- **Folato** é equivalente de folato; a DRI é mcg DFE. Aproximação, sinalizada.
- **Alimento sem micronutriente** (whey, rótulo do Open Food Facts) não entra na soma — e aparece nomeado na tela, para não virar "deficiência" falsa.
- **Gorduras** comparam com % da energia (saturados até 10%, poli 5–10%, trans <1%). Monoinsaturados não têm referência publicada — a tela mostra o valor absoluto, sem percentual.
- **Gestação/lactação** não são detectáveis: o model `Paciente` não tem esse campo. A função já suporta; falta o dado.

### 3.6 Arquivos entregues

```
nutriflow-micronutrientes/
├── backend/
│   ├── prisma/migrations/20261124000000_add_micronutrientes/migration.sql
│   ├── prisma/scripts/import-micronutrientes-tbca.ts
│   └── src/micronutrientes/
│       ├── micronutrientes.ts          (lógica pura, testada)
│       ├── nutrientes-plano.service.ts
│       ├── nutrientes.controller.ts
│       ├── nutrientes.module.ts
│       └── index.ts
└── frontend/
    ├── nutrientes.service.ts
    └── total-nutrientes-panel.tsx      (a aba)
```

### 3.7 Como aplicar

Um comando: `python instalar-micronutrientes.py` (detalhes em `LEIA-PRIMEIRO.md`).

Manual, se preferir:

```powershell
# 1. copiar os arquivos para as pastas correspondentes do seu projeto
#    backend/src/micronutrientes/  e  backend/prisma/migrations/...

# 2. registrar no app.module.ts
#    import { NutrientesModule } from './micronutrientes/nutrientes.module';
#    imports: [ ..., NutrientesModule ]

# 3. as pastas prisma/migrations/ e prisma/scripts/ já vão no lugar certo
cd nutriflow-backend
npx prisma migrate deploy
npx prisma generate

# 4. importar os micronutrientes (primeiro em seco, para conferir o relatório)
npx tsx prisma/scripts/import-micronutrientes-tbca.ts --dry-run
npx tsx prisma/scripts/import-micronutrientes-tbca.ts

# 5. subir
npm run start:dev
```

Conferir com `GET /planos-alimentares/{id}/nutrientes` no Swagger.

No frontend, basta montar `<TotalNutrientesPanel planoId={id} />` na tela de planejamento.

---

## 4. Os concorrentes — o que realmente têm

Pesquisa completa com fontes em `pesquisa-concorrentes.md`. O essencial:

| | WebDiet | Dietbox | Nutrium | Cronometer | Avanutri | **NutriFlow** |
|---|---|---|---|---|---|---|
| Micronutrientes | anuncia; tela não documentada | anuncia; semáforo é de macro | **100 componentes vs DRI e SACN** | **95 nutrientes, RDA/AI/UL** | macro + micro no banco | **23 (novo)** |
| Lista de compras | automática | existe | sim | — | sincronizada | **endpoint pronto, sem tela** |
| App do paciente | foto, chat, água, check-in | foto, chat, água | foto, água, Google Fit | diário | foto, diário | repo separado |
| Fórmulas | 9+ | não publicado | 14 | — | VET | Mifflin, Harris, EER |
| PDF | timbrado editável | sim | sim | — | sim | **não** |
| Preço/mês | R$ 94,90 / 139,90 | R$ 91,90 / 133,90 | ~R$ 49–52 | US$ 10,99 | **R$ 130/ano** | — |
| Reclamação dominante | plano some, sem exportação em lote | instabilidade, perda de planos | app desloga, não sincroniza | base fraca em regional | — | — |

### Três conclusões que mudam prioridade

**1. Micronutrientes é o único espaço realmente aberto.** WebDiet e Dietbox *anunciam* "micro automático", mas o que está documentado publicamente com detalhe é só adequação de macro. Quem faz de verdade, com relatório, é o Nutrium e o Cronometer. O Brasil está mal servido aqui — e você já tinha o dado em casa.

**2. A fraqueza dos líderes é infraestrutura, não feature.** As reclamações recorrentes são planos que desaparecem, instabilidade, perda de trabalho, suporte ruim. Isso é argumento de venda: "seu plano não some" vale mais que mais um gráfico.

**3. O que sustenta a recorrência é o pós-consulta, não o gerador.** Diário com foto, check-in, chat, água. É o que faz o paciente sentir que paga por acompanhamento. E é exatamente o que o seu modelo de R$ 200/mês precisa.

### O padrão de IA que vale copiar

O Cronometer documenta a regra que os outros escondem: **a IA identifica e organiza, nunca calcula nutriente**. Os números sempre vêm da base verificada. Copie esse princípio — inclusive como texto de marketing, porque é o que dá credibilidade clínica.

---

## 5. Roadmap

### Agora — dias, e destrava o resto

| # | Item | Esforço | Por quê |
|---|---|---|---|
| 1 | Corrigir o 400 ao salvar plano (DTO) | 2 h | Sem isso, o gerador pode estar inutilizável |
| 2 | Persistir substituições | 1 dia | Funcionalidade perdida em silêncio |
| 3 | `findOnePlano` devolver macros + medidas | 2 h | Plano reaberto volta vazio |
| 4 | Persistir a meta de macros | 1 dia | Todo painel de adequação depende |
| 5 | Tela da lista de compras (endpoint já existe) | 2 dias | Item "básico" de mercado, custo quase zero |
| 6 | PDF do plano com marca + CRN | 2–3 dias | É o que o paciente recebe ao fim da consulta |
| 7 | `altura` cm/metros e prop `antropometria` | 2 h | Botão morto |
| 8 | Enviar o trabalho local para o repo | 1 h | Hoje o sistema não é reproduzível |

### Médio — semanas

| # | Item | Esforço |
|---|---|---|
| 9 | **Aplicar a frente de micronutrientes** (entregue) | 2–3 dias de integração |
| 10 | Aba de micronutrientes com UL (limite superior), não só RDA | 3 dias |
| 11 | Busca com `pg_trgm` + `unaccent` no banco | 2 dias |
| 12 | `/resumo` usar o cálculo energético real | 1 dia |
| 13 | Resumo por refeição (kcal e macros por refeição) | 1–2 dias |
| 14 | Tabela de informação nutricional no layout ANVISA | 2–3 dias |
| 15 | Portal do paciente em PWA (plano do dia, cumpri/pulei, foto, água) | 2–3 semanas |

### Grande — meses, e são decisões de produto

| # | Item | Por quê agora não |
|---|---|---|
| 16 | App do paciente nativo com diário, chat e notificações | 2–3 meses. Envolve LGPD, upload, tempo real. O PWA entrega 80% por 20% do custo. |
| 17 | IQD-R (índice de qualidade da dieta) | Diferencial real, mas exige classificar 5.668 alimentos no Guia Alimentar — é curadoria, não código |
| 18 | IA assistiva (resumo de consulta, leitura de exame PDF) | Alto em marketing, médio em uso. Só depois que o básico for estável |
| 19 | Integração WhatsApp (lembrete, check-in, envio de plano) | Casa com a frente comercial já decidida |
| 20 | Motor de rótulo ANVISA com lupa frontal | **Recomendo não fazer**: é produto para indústria, outro mercado, já tem concorrente dedicado |

### Duas coisas para não fazer

- **Anúncio pago com ticket R$ 200** — o custo por paciente (R$ 50–250) come a receita do primeiro mês. Já estava decidido; reforço porque mudou nada.
- **Prometer resultado no Instagram** — Res. CFN 856/2026, em vigor em 23/01/2027, proíbe garantia de resultado, antes-e-depois e imagem corporal. O nicho esportivo é justamente onde a tentação é maior.

---

## 6. Se eu tivesse 30 dias

1. **Semana 1** — os bugs 1 a 4 e o 7. Nada novo entra antes de o que existe funcionar. Custo: ~3 dias.
2. **Semana 2** — aplicar micronutrientes e abrir a aba. É o único item que constrói vantagem que **nenhum concorrente brasileiro documenta**.
3. **Semana 3** — lista de compras na tela + PDF com marca. Com esses dois, o NutriFlow deixa de parecer protótipo e passa a parecer produto — e são os itens que aparecem em *todos* os concorrentes, inclusive no de R$ 130/ano.
4. **Semana 4** — PWA do paciente em versão mínima: plano do dia, "cumpri/pulei", água. É o começo do que justifica a mensalidade.

O que eu **não** faria nos próximos 30 dias: IA, app nativo, IQD-R. Todos dependem de uma base estável, e a base tem quatro bugs que quebram funcionalidade visível.
