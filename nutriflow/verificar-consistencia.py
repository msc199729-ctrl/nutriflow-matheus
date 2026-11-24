#!/usr/bin/env python3
"""
Verifica se os nomes dos 23 micronutrientes estão consistentes entre:
  1. prisma/schema-base-alimento.prisma       (campos do Prisma, camelCase)
  2. src/micronutrientes/micronutrientes.ts   (chave usada na agregação)
  3. prisma/scripts/import-micronutrientes-tbca.ts  (destino na importação)
  4. prisma/migrations/.../migration.sql      (colunas no banco, snake_case)

Um nome fora de sincronia aqui não dá erro de compilação — dá número errado
na tela. Por isso a checagem é automatizada.

Uso:  python3 verificar-consistencia.py
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent

# Os 6 macros que já existiam antes da frente de micronutrientes.
# Ficam de fora da comparação dos 23.
MACROS_ANTIGOS = {
    "calorias", "proteinas", "carboidratos", "gorduras", "fibras", "sodio",
}


def ler(caminho: str) -> str:
    p = RAIZ / caminho
    if not p.exists():
        print(f"  ! arquivo não encontrado: {caminho}")
        return ""
    return p.read_text(encoding="utf-8")


def main() -> int:
    schema = ler("backend/prisma/schema-base-alimento.prisma")
    lib = ler("backend/src/micronutrientes/micronutrientes.ts")
    imp = ler("backend/prisma/scripts/import-micronutrientes-tbca.ts")
    sql = ler(
        "backend/prisma/migrations/20261124000000_add_micronutrientes/migration.sql"
    )

    # ── 1. Schema: pares (campo, coluna) dos Float? ────────────────────────
    pares = {}
    for m in re.finditer(
        r"^\s{2}(\w+)\s+Float\?\s+@map\(\"(\w+)\"\)", schema, re.M
    ):
        pares[m.group(1)] = m.group(2)
    for m in re.finditer(r"^\s{2}(\w+)\s+Float\?\s*$", schema, re.M):
        pares[m.group(1)] = m.group(1)

    campos_micro = {c for c in pares if c not in MACROS_ANTIGOS}
    colunas_micro = {pares[c] for c in campos_micro}

    # ── 2. Lib: chaves ─────────────────────────────────────────────────────
    chaves_lib = set(re.findall(r"chave:\s*'(\w+)'", lib))

    # ── 3. Importador: valores do MAPA ─────────────────────────────────────
    bloco = re.search(r"const MAPA[^{]*\{(.*?)\};", imp, re.S)
    destinos_imp = set(re.findall(r":\s*'(\w+)'", bloco.group(1))) if bloco else set()

    # ── 4. SQL: só as colunas de micronutriente ────────────────────────────
    todas_sql = set(
        re.findall(r'ADD COLUMN IF NOT EXISTS "(\w+)"\s+DOUBLE PRECISION', sql)
    )
    # remove as colunas de distribuição do cálculo energético (*_g_kg)
    colunas_sql = {c for c in todas_sql if not c.endswith("_g_kg")}

    print("=" * 70)
    print(f"{'fonte':38}{'itens':>8}")
    print("-" * 70)
    print(f"{'schema — campos micro (camelCase)':38}{len(campos_micro):>8}")
    print(f"{'schema — colunas micro (snake_case)':38}{len(colunas_micro):>8}")
    print(f"{'lib — chaves de agregação':38}{len(chaves_lib):>8}")
    print(f"{'importador — destinos do MAPA':38}{len(destinos_imp):>8}")
    print(f"{'migração — colunas DOUBLE PRECISION':38}{len(colunas_sql):>8}")
    print("=" * 70)

    if not campos_micro:
        print("ERRO: não consegui ler os campos do schema. Abortando.")
        return 1

    falhas = 0

    def comparar(nome: str, conjunto: set, referencia: set) -> None:
        nonlocal falhas
        if conjunto == referencia:
            print(f"✓ {nome}")
            return
        falhas += 1
        faltam = referencia - conjunto
        sobram = conjunto - referencia
        print(f"✗ {nome}")
        if faltam:
            print(f"    faltando: {sorted(faltam)}")
        if sobram:
            print(f"    a mais:   {sorted(sobram)}")

    # A lib e o importador usam camelCase → comparar com campos.
    comparar("lib ↔ schema (campos)", chaves_lib, campos_micro)
    comparar("importador ↔ schema (campos)", destinos_imp, campos_micro)
    # O SQL usa snake_case → comparar com colunas.
    comparar("migração ↔ schema (colunas)", colunas_sql, colunas_micro)

    # ── Checagem extra: chave ↔ componente TBCA 1:1 ────────────────────────
    componentes = re.findall(r"componenteTbca:\s*'([^']+)'", lib)
    if len(set(componentes)) != len(componentes):
        print("✗ lib: componente TBCA repetido (duas chaves lendo o mesmo dado)")
        falhas += 1
    elif len(set(componentes)) != len(chaves_lib):
        print(
            f"✗ lib: {len(chaves_lib)} chaves mas {len(set(componentes))} componentes "
            "TBCA distintos (devem ser 1:1)"
        )
        falhas += 1
    else:
        print(f"✓ lib: {len(chaves_lib)} chaves ↔ {len(set(componentes))} componentes TBCA (1:1)")

    # ── Checagem extra: cada campo tem coluna distinta ─────────────────────
    if len(set(pares.values())) != len(pares):
        dup = {v for v in pares.values() if list(pares.values()).count(v) > 1}
        print(f"✗ schema: coluna duplicada para campos diferentes: {sorted(dup)}")
        falhas += 1

    # ── Checagem extra: SQL cobre exatamente as colunas do schema ──────────
    # (colunas_micro já é comparado; aqui garantimos que não há coluna a mais
    #  tipo *_g_kg sendo confundida)
    extras = {c for c in todas_sql if c.endswith("_g_kg")}
    if extras:
        print(f"ℹ migração também cria as colunas de distribuição: {sorted(extras)}")

    print("=" * 70)
    if falhas == 0:
        print(
            f"RESULTADO: OK — {len(campos_micro)} nutrientes consistentes em todas as fontes."
        )
        return 0
    print(f"RESULTADO: {falhas} divergência(s). Corrija antes de importar.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
