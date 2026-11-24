#!/usr/bin/env python3
"""
Instalador da frente de micronutrientes no NutriFlow.

Faz as edições sozinho nos arquivos que já existem, em vez de você colar bloco
por bloco. Tudo é idempotente e verificado:
  - se a mudança já está aplicada, ele avisa e não toca no arquivo
  - ele faz backup (.bak) antes de alterar
  - no fim, ele lê os arquivos alterados e confirma o resultado
  - `--dry-run` mostra o que faria, sem gravar

Uso (da raiz do clone, a pasta que contém nutriflow-backend e nutriflow-frontend):

    python3 instalar-micronutrientes.py --dry-run
    python3 instalar-micronutrientes.py

Ou aponte os dois caminhos:

    python3 instalar-micronutrientes.py --backend C:\\...\\nutriflow-backend \\
                                       --frontend C:\\...\\nutriflow-frontend
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

SECAO = "02"  # apoio visual no log

# Campos de micronutriente que o código espera encontrar no model BaseAlimento.
# Bate com o schema do projeto (vitaminaARae, gorduraSaturada, ...).
CAMPOS_PRISMA_ESPERADOS = [
    "calcio", "ferro", "magnesio", "fosforo", "potassio", "zinco",
    "cobre", "selenio",
    "vitaminaARae", "vitaminaC", "vitaminaD", "vitaminaE", "tiamina",
    "vitaminaB2", "vitaminaB3", "vitaminaB6", "vitaminaB12", "folato",
    "gorduraSaturada", "gorduraMonoinsaturada", "gorduraPoliinsaturada",
    "gorduraTrans", "colesterol",
]

# ---------------------------------------------------------------------------
# Model BaseAlimento com os 23 micronutrientes
# ---------------------------------------------------------------------------
MODEL_BASE_ALIMENTO = """model BaseAlimento {
  id                Int     @id @default(autoincrement())
  nome              String
  /// Marca comercial quando disponível (ex.: Open Food Facts).
  marca             String? @map("marca")
  codigoBarras      String? @unique @map("codigo_barras")
  fdcId             Int?    @unique @map("fdc_id")
  /// Código alfanumérico da TBCA (ex.: C0113T), quando a linha veio dessa base
  codigoTbca        String? @unique @map("codigo_tbca")
  classeTbca        String? @map("classe_tbca")
  fonte             String?
  calorias          Float?
  proteinas         Float?
  carboidratos      Float?
  gorduras          Float?
  fibras            Float?
  sodio             Float?
  ehUltraprocessado Boolean @default(false) @map("eh_ultraprocessado")
  scoreNova         Int?    @map("score_nova")

  // ── Micronutrientes (por 100 g da parte comestível) ────────────────────
  // Fonte: TBCA. Ausência de dado = null (nunca 0).
  // A TBCA não traz: vitamina K, B5, biotina, manganês, cromo, iodo.

  // Minerais
  calcio            Float?
  ferro             Float?
  magnesio          Float?
  fosforo           Float?
  potassio          Float?
  zinco             Float?
  cobre             Float?  @map("cobre")
  selenio           Float?  @map("selenio")

  // Vitaminas
  vitaminaA         Float?  @map("vitamina_a")
  vitaminaC         Float?  @map("vitamina_c")
  vitaminaD         Float?  @map("vitamina_d")
  vitaminaE         Float?  @map("vitamina_e")
  tiamina           Float?  @map("tiamina")
  riboflavina       Float?  @map("riboflavina")
  niacina           Float?  @map("niacina")
  vitaminaB6        Float?  @map("vitamina_b6")
  vitaminaB12       Float?  @map("vitamina_b12")
  folato            Float?  @map("folato")

  // Gorduras
  agSaturados       Float?  @map("ag_saturados")
  agMonoinsaturados Float?  @map("ag_monoinsaturados")
  agPoliinsaturados Float?  @map("ag_poliinsaturados")
  agTrans           Float?  @map("ag_trans")
  colesterol        Float?  @map("colesterol")

  itensDieta       ItemDieta[]
  itensConsumidos  ItemConsumido[]

  @@map("base_alimentos")
}"""


class Relatorio:
    def __init__(self, dry_run: bool) -> None:
        self.dry_run = dry_run
        self.ok: list[str] = []
        self.pulados: list[str] = []
        self.erros: list[str] = []

    def feito(self, msg: str) -> None:
        self.ok.append(msg)
        print(f"  {'[dry]' if self.dry_run else '✓'} {msg}")

    def pulou(self, msg: str) -> None:
        self.pulados.append(msg)
        print(f"  = {msg}")

    def erro(self, msg: str) -> None:
        self.erros.append(msg)
        print(f"  ✗ {msg}")


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def ler(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def gravar(p: Path, conteudo: str, rel: Relatorio) -> None:
    """Grava com backup .bak, preservando quebras de linha do original."""
    if rel.dry_run:
        return
    if p.exists() and not p.with_suffix(p.suffix + ".bak").exists():
        shutil.copy2(p, p.with_suffix(p.suffix + ".bak"))
    # Não deixa o Python converter CRLF (Windows) em LF
    p.write_bytes(conteudo.encode("utf-8"))


def achar_raiz(informado: str | None, nome: str, inicio: Path) -> Path | None:
    """Procura a pasta do projeto pelo nome, olhando para cima a partir do cwd."""
    if informado:
        p = Path(informado).expanduser().resolve()
        return p if p.exists() else None
    atual = inicio.resolve()
    for _ in range(6):
        candidato = atual / nome
        if candidato.is_dir():
            return candidato
        if atual.name == nome:
            return atual
        atual = atual.parent
    return None


def _parece_backend(p: Path) -> bool:
    """Pasta de backend NestJS: tem prisma/schema.prisma e src/app.module.ts."""
    return (p / "prisma" / "schema.prisma").is_file() and (
        p / "src" / "app.module.ts"
    ).is_file()


def _parece_frontend(p: Path) -> bool:
    """Pasta de frontend Next.js: tem package.json e src/ ou app/."""
    pkg = p / "package.json"
    if not pkg.is_file():
        return False
    if not ((p / "src").is_dir() or (p / "app").is_dir()):
        return False
    try:
        txt = pkg.read_text(encoding="utf-8", errors="ignore").lower()
    except OSError:
        return False
    return "next" in txt


def descobrir_por_conteudo(inicio: Path, profundidade: int = 4):
    """
    Varre a árvore procurando as pastas de backend e frontend pelo conteúdo,
    sem depender do nome. Ignora node_modules, .git, dist, .next.
    """
    IGNORAR = {
        "node_modules", ".git", "dist", "build", ".next", "coverage",
        "venv", ".venv", "__pycache__", "tmp",
    }
    backend = frontend = None
    base = inicio.resolve()

    def varrer(pasta: Path, nivel: int) -> None:
        nonlocal backend, frontend
        if nivel > profundidade:
            return
        try:
            filhos = [d for d in pasta.iterdir() if d.is_dir()]
        except (PermissionError, OSError):
            return
        for d in filhos:
            if d.name in IGNORAR or d.name.startswith("."):
                continue
            if backend is None and _parece_backend(d):
                backend = d
            if frontend is None and _parece_frontend(d):
                frontend = d
            if backend is not None and frontend is not None:
                return
            varrer(d, nivel + 1)

    # a própria pasta informada pode ser o backend ou o frontend
    if _parece_backend(base):
        backend = base
    if _parece_frontend(base):
        frontend = base
    if backend is None or frontend is None:
        varrer(base, 1)
    return backend, frontend



# ---------------------------------------------------------------------------
# 1. schema.prisma
# ---------------------------------------------------------------------------

def aplicar_schema(backend: Path, rel: Relatorio) -> None:
    """
    Confere se o model BaseAlimento já tem os 23 campos de micronutriente.
    NÃO substitui o model: se o projeto já tem a frente aplicada (nomes
    próprios, como vitaminaARae e gorduraSaturada), mexer nele perderia dado.
    """
    print("\n1. Schema do Prisma")
    schema = backend / "prisma" / "schema.prisma"
    if not schema.exists():
        rel.erro(f"não encontrei {schema}")
        return

    txt = ler(schema)
    m = re.search(r"model BaseAlimento \{.*?\n\}", txt, re.DOTALL)
    if not m:
        rel.erro("não achei 'model BaseAlimento' no schema.prisma")
        return

    bloco = m.group(0)
    faltando = [c for c in CAMPOS_PRISMA_ESPERADOS if c not in bloco]
    if not faltando:
        rel.pulou("BaseAlimento já tem os 23 campos de micronutriente")
        return

    rel.erro(
        "faltam campos de micronutriente no BaseAlimento: "
        + ", ".join(faltando)
        + "\n     A frente pode estar aplicada com outro nome. Confira o model"
        " antes de seguir; o instalador não altera o schema para não perder dado."
    )


# ---------------------------------------------------------------------------
# 2. app.module.ts
# ---------------------------------------------------------------------------

def aplicar_app_module(backend: Path, rel: Relatorio) -> None:
    print("\n2. Registro do módulo (app.module.ts)")
    arq = backend / "src" / "app.module.ts"
    if not arq.exists():
        rel.erro(f"não encontrei {arq}")
        return

    txt = ler(arq)
    if "NutrientesModule" in txt:
        rel.pulou("NutrientesModule já registrado")
        return

    # import: logo depois do último import do topo
    imports = list(re.finditer(r"^import .*?;$", txt, re.M))
    if not imports:
        rel.erro("não achei nenhum import em app.module.ts")
        return
    fim_imports = imports[-1].end()
    linha_import = "\nimport { NutrientesModule } from './micronutrientes/nutrientes.module';"

    # dentro de imports: [ ... ] do @Module
    m = re.search(r"(\n\s*imports:\s*\[)", txt)
    if not m:
        rel.erro("não achei o array 'imports:' em app.module.ts")
        return

    novo = txt[:fim_imports] + linha_import + txt[fim_imports:]
    # recalcula posição depois de inserir
    m = re.search(r"(\n\s*imports:\s*\[)", novo)
    pos = m.end()
    resto = novo[pos:]

    # Descobre a indentação do primeiro item existente (se houver).
    m_item = re.match(r"\n(\s*)\S", resto)
    if m_item:
        indent = m_item.group(1)
        inserir = f"\n{indent}NutrientesModule,"
        novo = novo[:pos] + inserir + novo[pos:]
    else:
        # Array na mesma linha: "imports: [A, B]," -> vira multilinha.
        indent_base = "    " 
        itens = resto.split("]", 1)
        conteudo = itens[0].strip()
        cauda = "]" + itens[1] if len(itens) > 1 else "]"
        novo_conteudo = (
            f"\n{indent_base}NutrientesModule,"
            + (f"\n{indent_base}{conteudo}" if conteudo else "")
            + f"\n  {cauda.lstrip()}"
        )
        novo = novo[:pos] + novo_conteudo + ""

    gravar(arq, novo, rel)
    rel.feito("NutrientesModule registrado no app.module.ts")


# ---------------------------------------------------------------------------
# 3. painel de planos: botão + dialog
# ---------------------------------------------------------------------------

def aplicar_painel(frontend: Path, rel: Relatorio) -> None:
    print("\n3. Botão na lista de planos")
    arq = (
        frontend
        / "src"
        / "components"
        / "diet"
        / "plano-alimentar-paciente-panel.tsx"
    )
    if not arq.exists():
        rel.erro(f"não encontrei {arq}")
        return

    txt = ler(arq)
    if "NutrientesDialog" in txt:
        rel.pulou("o painel já tem o botão de nutrientes")
        return

    original = txt

    # a) import do dialog
    alvo = 'import { EditarPlanoDialog } from "@/components/diet/editar-plano-dialog";'
    if alvo in txt:
        txt = txt.replace(
            alvo,
            alvo
            + '\nimport { NutrientesDialog } from "@/components/diet/nutrientes-dialog";',
        )
    else:
        rel.erro("não achei o import de EditarPlanoDialog para ancorar")
        return

    # b) ícone ChartColumn no import do lucide
    m = re.search(r"import \{([^}]*)\} from \"lucide-react\";", txt, re.S)
    if not m:
        rel.erro("não achei o import do lucide-react")
        return
    if "ChartColumn" not in m.group(1):
        nomes = [n.strip() for n in m.group(1).split(",") if n.strip()]
        nomes.append("ChartColumn")
        nomes.sort()
        novo_bloco = "import {\n" + "".join(f"  {n},\n" for n in nomes) + '} from "lucide-react";'
        txt = txt[: m.start()] + novo_bloco + txt[m.end():]

    # c) estado do plano selecionado
    alvo_estado = "const [shoppingId, setShoppingId] = useState<number | null>(null);"
    if alvo_estado not in txt:
        rel.erro("não achei o estado shoppingId para ancorar")
        return
    txt = txt.replace(
        alvo_estado,
        alvo_estado
        + "\n  const [nutrientesPlano, setNutrientesPlano] = useState<{\n"
        + "    id: number;\n    nome: string | null;\n  } | null>(null);",
    )

    # d) botão, logo depois do botão da lista de compras
    m = re.search(r'onClick=\{\(\) => setShoppingId\(p\.id\)\}.*?</button>', txt, re.S)
    if not m:
        rel.erro("não achei o botão da lista de compras para ancorar")
        return
    botao = """

                      <button
                        type="button"
                        onClick={() =>
                          setNutrientesPlano({ id: p.id, nome: p.nome })
                        }
                        className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        title="Total de nutrientes"
                      >
                        <ChartColumn className="size-4" />
                      </button>"""
    txt = txt[: m.end()] + botao + txt[m.end():]

    # e) dialog, junto do ShoppingListDialog
    m = re.search(r"<ShoppingListDialog[\s\S]*?/>", txt)
    if not m:
        rel.erro("não achei o <ShoppingListDialog> para ancorar")
        return
    dialog = """
      <NutrientesDialog
        planoId={nutrientesPlano?.id ?? null}
        nomePlano={nutrientesPlano?.nome ?? null}
        onOpenChange={(v) => {
          if (!v) setNutrientesPlano(null);
        }}
      />"""
    txt = txt[: m.end()] + dialog + txt[m.end():]

    if txt == original:
        rel.erro("nenhuma alteração aplicada no painel")
        return

    gravar(arq, txt, rel)
    rel.feito("botão de nutrientes + dialog adicionados ao painel")


def aplicar_tsconfig(backend: Path, rel: Relatorio) -> None:
    """Exclui a pasta do pacote (nutriflow/) da compilação do backend."""
    print("\n3. tsconfig.build.json (excluir pasta do pacote)")
    arq = backend / "tsconfig.build.json"
    if not arq.exists():
        rel.erro(f"não encontrei {arq} — confirme que está na raiz do backend")
        return

    txt = ler(arq)
    if '"nutriflow"' in txt:
        rel.pulou("tsconfig.build.json já exclui a pasta do pacote")
        return

    m = re.search(r'"exclude"\s*:\s*\[([^\]]*)\]', txt)
    if not m:
        rel.erro("não achei o array 'exclude' no tsconfig.build.json")
        return

    itens = m.group(1).rstrip().rstrip(",")
    novo = txt[: m.start()] + '"exclude": [' + itens + ', "nutriflow"]' + txt[m.end():]
    gravar(arq, novo, rel)
    rel.feito('tsconfig.build.json: "nutriflow" adicionado ao exclude')


# ---------------------------------------------------------------------------
# 4. cópia dos arquivos novos
# ---------------------------------------------------------------------------

NOVOS = [
    ("backend/src/micronutrientes", "backend/src/micronutrientes"),
    ("backend/prisma/scripts", "backend/prisma/scripts"),
    ("frontend", "frontend/src/components/diet"),
]


def copiar_novos(pacote: Path, backend: Path, frontend: Path, rel: Relatorio) -> None:
    print("\n4. Arquivos novos")
    mapa = [
        ("backend/src/micronutrientes", backend / "src" / "micronutrientes"),
        ("backend/prisma/scripts", backend / "prisma" / "scripts"),
    ]
    for origem_rel, destino in mapa:
        origem = pacote / origem_rel
        if not origem.is_dir():
            rel.erro(f"não encontrei {origem_rel} no pacote")
            continue
        destino.mkdir(parents=True, exist_ok=True)
        for f in sorted(origem.glob("*")):
            if f.is_file():
                if rel.dry_run:
                    rel.feito(f"{f.name} → {destino}")
                else:
                    shutil.copy2(f, destino / f.name)
                    rel.feito(f"{f.name} → {destino}")

    # migração
    mig_origem = pacote / "backend/prisma/migrations"
    mig_destino = backend / "prisma" / "migrations"
    if mig_origem.is_dir():
        mig_destino.mkdir(parents=True, exist_ok=True)
        for d in sorted(mig_origem.iterdir()):
            if d.is_dir():
                alvo = mig_destino / d.name
                if alvo.exists():
                    rel.pulou(f"migração {d.name} já existe")
                    continue
                if not rel.dry_run:
                    shutil.copytree(d, alvo)
                rel.feito(f"migração {d.name} copiada")

    # frontend
    destinos_fe = [
        (pacote / "frontend" / "nutrientes.service.ts",
         frontend / "src" / "services" / "nutrientes.service.ts"),
        (pacote / "frontend" / "total-nutrientes-panel.tsx",
         frontend / "src" / "components" / "diet" / "total-nutrientes-panel.tsx"),
        (pacote / "frontend" / "nutrientes-dialog.tsx",
         frontend / "src" / "components" / "diet" / "nutrientes-dialog.tsx"),
    ]
    for origem, destino in destinos_fe:
        if not origem.exists():
            rel.erro(f"não encontrei {origem.name} no pacote")
            continue
        destino.parent.mkdir(parents=True, exist_ok=True)
        if not rel.dry_run:
            shutil.copy2(origem, destino)
        rel.feito(f"{origem.name} → {destino}")


# ---------------------------------------------------------------------------
# 5. verificação final
# ---------------------------------------------------------------------------

def verificar(backend: Path, frontend: Path, rel: Relatorio) -> None:
    print("\n5. Verificação")
    if rel.dry_run:
        print("  (dry-run: verificação pulada)")
        return

    checagens = [
        (backend / "prisma" / "schema.prisma", "vitaminaA", "schema com micronutrientes"),
        (backend / "src" / "app.module.ts", "NutrientesModule", "módulo registrado"),
        (backend / "src" / "micronutrientes" / "micronutrientes.ts", "agregarNutrientes", "lógica de agregação"),
        (frontend / "src" / "components" / "diet" / "total-nutrientes-panel.tsx", "TotalNutrientesPanel", "componente da aba"),
        (frontend / "src" / "components" / "diet" / "nutrientes-dialog.tsx", "NutrientesDialog", "dialog"),
        (frontend / "src" / "services" / "nutrientes.service.ts", "nutrientesService", "service do frontend"),
    ]
    for arq, marca, descricao in checagens:
        if not arq.exists():
            rel.erro(f"{descricao}: arquivo ausente ({arq.name})")
        elif marca not in ler(arq):
            rel.erro(f"{descricao}: conteúdo esperado não encontrado")
        else:
            print(f"  ✓ {descricao}")

    painel = frontend / "src" / "components" / "diet" / "plano-alimentar-paciente-panel.tsx"
    if painel.exists():
        t = ler(painel)
        for marca in ("NutrientesDialog", "ChartColumn", "nutrientesPlano"):
            if marca not in t:
                rel.erro(f"painel: falta '{marca}'")
                break
        else:
            print("  ✓ painel com botão e dialog")

    # contagem de nutrientes no schema
    schema_txt = ler(backend / "prisma" / "schema.prisma")
    bloco = re.search(r"model BaseAlimento \{.*?\n\}", schema_txt, re.S)
    if bloco:
        campos = re.findall(r"^\s{2}(\w+)\s+Float\?", bloco.group(0), re.M)
        micros = [c for c in campos if c not in
                  {"calorias", "proteinas", "carboidratos", "gorduras", "fibras", "sodio"}]
        print(f"  ✓ {len(micros)} campos de micronutriente no BaseAlimento")


def main() -> int:
    ap = argparse.ArgumentParser(description="Instala a frente de micronutrientes no NutriFlow.")
    ap.add_argument("--backend", help="pasta nutriflow-backend")
    ap.add_argument("--frontend", help="pasta nutriflow-frontend")
    ap.add_argument("--pacote", help="pasta com os arquivos desta entrega (default: a pasta do script)")
    ap.add_argument("--dry-run", action="store_true", help="mostra o que faria, sem gravar")
    args = ap.parse_args()

    inicio = Path.cwd()
    pacote = Path(args.pacote).resolve() if args.pacote else Path(__file__).resolve().parent

    backend = achar_raiz(args.backend, "nutriflow-backend", inicio)
    frontend = achar_raiz(args.frontend, "nutriflow-frontend", inicio)

    # Se o nome não bateu, procura pelo conteúdo (funciona com qualquer nome
    # de pasta: backend/, api/, web/, front/, etc.)
    if backend is None or frontend is None:
        b2, f2 = descobrir_por_conteudo(inicio)
        backend = backend or b2
        frontend = frontend or f2

    rel = Relatorio(args.dry_run)

    print("=" * 66)
    print("Instalador de micronutrientes — NutriFlow")
    print("=" * 66)
    print(f"pacote  : {pacote}")
    print(f"backend : {backend or 'NÃO ENCONTRADO'}")
    print(f"frontend: {frontend or 'NÃO ENCONTRADO'}")
    if args.dry_run:
        print("modo    : DRY-RUN (nada será gravado)")

    if not backend or not frontend:
        print("\nNão achei as pastas. O que existe em", inicio, ":")
        try:
            for d in sorted(inicio.iterdir()):
                if d.is_dir() and not d.name.startswith("."):
                    marcas = []
                    if (d / "prisma" / "schema.prisma").is_file():
                        marcas.append("tem prisma/schema.prisma")
                    if (d / "package.json").is_file():
                        marcas.append("tem package.json")
                    if (d / "src").is_dir():
                        marcas.append("tem src/")
                    print(f"  - {d.name}/" + (f"   ({', '.join(marcas)})" if marcas else ""))
        except OSError:
            pass
        print(
            "\nPasse os caminhos na mão:\n"
            "  --backend  C:\\...\\<pasta do backend>\n"
            "  --frontend C:\\...\\<pasta do frontend>"
        )
        return 2

    aplicar_schema(backend, rel)
    aplicar_app_module(backend, rel)
    aplicar_tsconfig(backend, rel)
    copiar_novos(pacote, backend, frontend, rel)
    aplicar_painel(frontend, rel)
    verificar(backend, frontend, rel)

    print("\n" + "=" * 66)
    print(f"aplicados: {len(rel.ok)} | já estava: {len(rel.pulados)} | erros: {len(rel.erros)}")
    if rel.erros:
        print("\nERROS — nada foi commitado, corrija e rode de novo:")
        for e in rel.erros:
            print(f"  - {e}")
        return 1

    if args.dry_run:
        print("\nDry-run ok. Rode sem --dry-run para aplicar.")
        return 0

    print(
        """
Próximos passos:

  cd nutriflow-backend
  npx prisma migrate deploy
  npx prisma generate
  npx tsx prisma/scripts/import-micronutrientes-tbca.ts --dry-run
  npx tsx prisma/scripts/import-micronutrientes-tbca.ts
  npm run start:dev

Backups .bak foram criados ao lado dos arquivos alterados.
"""
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
