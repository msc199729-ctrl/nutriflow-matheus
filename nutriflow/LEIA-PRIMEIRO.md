# Micronutrientes no NutriFlow — instalador

Você não precisa mais colar nada à mão. Rode **um comando**.

## O que fazer

Abra o PowerShell na pasta `C:\Users\mathe\nutriflow-matheus` (a que tem
`prisma`, `src`, `dist` e `nutriflow-frontend` dentro) e rode:

```powershell
python nutriflow\instalar-micronutrientes.py --dry-run
```

Ele mostra tudo que vai fazer, sem tocar em nada. O instalador **descobre as
pastas backend e frontend sozinho**, mesmo que tenham outro nome — ele procura
por `prisma/schema.prisma`, `src/app.module.ts` e `package.json` com Next.

Se estiver bom:

```powershell
python nutriflow\instalar-micronutrientes.py
```

Depois:

```powershell
# você já está dentro do backend (nutriflow-matheus É o backend)
cd C:\Users\mathe\nutriflow-matheus
npx prisma migrate deploy
npx prisma generate
npx tsx prisma/scripts/import-micronutrientes-tbca.ts --dry-run
npx tsx prisma/scripts/import-micronutrientes-tbca.ts
npm run start:dev
```

E, em outro terminal, o frontend:

```powershell
cd C:\Users\mathe\nutriflow-matheus\nutriflow-frontend
npm run dev
```

Pronto. Na lista de planos do paciente aparece um ícone de barras — é a aba
"Total de nutrientes".

---

## O que o instalador faz

| # | Ação | Onde |
|---|---|---|
| 1 | **Confere** se o `BaseAlimento` já tem os 23 campos (não altera) | `prisma/schema.prisma` |
| 2 | Registra `NutrientesModule` | `src/app.module.ts` |
| 3 | Copia migração, importador e módulo | `backend/` |
| 4 | Copia a aba, o dialog e o service | `frontend/src/` |
| 5 | Adiciona o botão e o dialog na lista de planos | `plano-alimentar-paciente-panel.tsx` |
| 6 | **Confere** que tudo ficou no lugar e reporta | — |

## Segurança

- **`--dry-run` primeiro.** Mostra tudo sem gravar.
- **Backup `.bak`** ao lado de cada arquivo alterado (o primeiro backup não é sobrescrito).
- **Idempotente.** Rodar duas vezes não duplica nada — o que já está aplicado é pulado com `=` e reportado no fim.
- **Não altera o schema.prisma.** Ele só confere os campos; se já existem (como no seu caso), não toca.
- **Não apaga nada.** A migração só faz `ADD COLUMN IF NOT EXISTS` — rodar num banco que já tem as colunas não faz nada.
- **Não toca em git.** Nada é commitado nem enviado.

## Se der erro

O instalador para e diz exatamente onde falhou. Nada fica pela metade: ele
aplica em ordem e valida no fim.

Se ele não achar as pastas, ele lista o que existe na pasta atual e diz quais
marcas cada uma tem. Aí passe os caminhos na mão:

```powershell
python nutriflow\instalar-micronutrientes.py `
  --backend  C:\Users\mathe\nutriflow-matheus\<pasta-do-backend> `
  --frontend C:\Users\mathe\nutriflow-matheus\<pasta-do-frontend>
```

---

## Depois de instalar

### Conferir que os micros entraram no banco

```powershell
cd C:\Users\mathe\nutriflow-matheus
npx prisma studio
```

`base_alimentos` → ordene por `id` → as colunas `calcio`, `ferro`,
`vitamina_c` devem ter valor.

Ou por SQL:

```sql
SELECT COUNT(*) AS total,
       ROUND(100.0 * COUNT(calcio) / COUNT(*), 1) AS pct_calcio,
       ROUND(100.0 * COUNT(selenio) / COUNT(*), 1) AS pct_selenio
FROM base_alimentos;
```

Esperado: **~100% cálcio**, **~82% selênio** (pior cobertura da TBCA).

### Testar o endpoint

`http://localhost:3000/api/docs` → **Nutrientes** →
`GET /planos-alimentares/{id}/nutrientes`.

A resposta deve ter 23 itens em `totais`.

### Ver na tela

Dashboard → Pacientes → paciente → **Planejamento Alimentar** → no plano,
clique no ícone de **barras**.

---

## O que ainda não está pronto

- **Aba no gerador em memória** (antes de salvar). Hoje só em plano salvo.
- **UL (limite superior)**, só RDA/AI.
- **Gestação/lactação** — a função suporta, o model `Paciente` não tem o campo.
- **Custo por refeição** — hoje é só o total do dia.
