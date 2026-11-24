"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Minus,
  TriangleAlert,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  nutrientesService,
  type NutrientesDoPlano,
  type TotalNutriente,
} from "@/services/nutrientes.service";

const ORDEM_GRUPOS = [
  { id: "minerais", rotulo: "Minerais" },
  { id: "vitaminas", rotulo: "Vitaminas" },
  { id: "gorduras", rotulo: "Gorduras" },
] as const;

type Faixa = "critico" | "atencao" | "ok" | "acima" | "sem-referencia";

/**
 * Classificação visual.
 * - < 70% da referência: crítico (amarelo)
 * - 70–99%: atenção (âmbar claro)
 * - 100–150%: adequado (verde)
 * - > 150%: acima (azul — não é erro, mas vale olhar; para gorduras é alerta)
 */
function faixa(t: TotalNutriente): Faixa {
  if (t.percentual === null || t.referencia === null) return "sem-referencia";
  if (t.percentual < 70) return "critico";
  if (t.percentual < 100) return "atencao";
  if (t.tipoReferencia === "LIMITE") {
    return t.percentual <= 100 ? "ok" : "acima";
  }
  if (t.percentual > 150) return "acima";
  return "ok";
}

const CORES: Record<Faixa, { texto: string; barra: string; fundo: string }> = {
  critico: {
    texto: "text-amber-700 dark:text-amber-400",
    barra: "bg-amber-500",
    fundo: "bg-amber-500/10",
  },
  atencao: {
    texto: "text-amber-600 dark:text-amber-300",
    barra: "bg-amber-400",
    fundo: "bg-amber-400/10",
  },
  ok: {
    texto: "text-emerald-700 dark:text-emerald-400",
    barra: "bg-emerald-500",
    fundo: "bg-emerald-500/10",
  },
  acima: {
    texto: "text-sky-700 dark:text-sky-400",
    barra: "bg-sky-500",
    fundo: "bg-sky-500/10",
  },
  "sem-referencia": {
    texto: "text-muted-foreground",
    barra: "bg-muted-foreground/40",
    fundo: "bg-muted/40",
  },
};

/** Formata número com no máximo 1 decimal, sem ",0" inútil. */
function fmt(v: number): string {
  const arred = Math.round(v * 10) / 10;
  return Number.isInteger(arred)
    ? String(arred)
    : arred.toFixed(1).replace(".", ",");
}

function iconeFaixa(f: Faixa) {
  if (f === "ok") return <Check className="size-3.5" />;
  if (f === "critico") return <TriangleAlert className="size-3.5" />;
  if (f === "acima") return <AlertTriangle className="size-3.5" />;
  return <Minus className="size-3.5" />;
}

function LinhaNutriente({ t }: { t: TotalNutriente }) {
  const f = faixa(t);
  const cores = CORES[f];
  // barra limitada a 100% visualmente; o número ao lado mostra o real
  const largura = Math.min(100, Math.max(0, t.percentual ?? 0));

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex items-center gap-1.5">
          <span className="text-sm text-foreground truncate">{t.rotulo}</span>
          {t.incompleto && (
            <span
              title="Algum alimento do plano não informa este nutriente — o total pode estar subestimado"
              className="shrink-0 text-muted-foreground/70"
            >
              <AlertTriangle className="size-3" />
            </span>
          )}
        </div>

        <div className="shrink-0 text-right">
          <span className="text-sm font-medium tabular-nums text-foreground">
            {fmt(t.prescrito)} {t.unidade}
          </span>
          {t.referencia !== null && (
            <span className="text-[11px] text-muted-foreground ml-1.5">
              / {fmt(t.referencia)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", cores.barra)}
            style={{ width: `${largura}%` }}
          />
        </div>
        <span
          className={cn(
            "shrink-0 inline-flex items-center gap-1 text-[11px] font-medium tabular-nums w-[3.6rem] justify-end",
            cores.texto,
          )}
        >
          {iconeFaixa(f)}
          {t.percentual !== null ? `${t.percentual}%` : "—"}
        </span>
      </div>

      {t.nota && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{t.nota}</p>
      )}
      {t.tipoReferencia === "AI" && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          referência por ingestão adequada (AI)
        </p>
      )}
    </li>
  );
}

interface Props {
  planoId: number;
  /** Abre já expandida (ex.: quando o usuário clicou na aba). */
  abertoInicial?: boolean;
  /**
   * Quando true, não desenha o Card em volta — usado dentro de um Dialog,
   * onde um Card dentro de outro fica pesado visualmente.
   */
  semCard?: boolean;
}

/**
 * Aba "Ver total de nutrientes" do planejamento alimentar.
 *
 * Mostra o total prescrito de cada nutriente comparado com a recomendação do
 * paciente (DRI), agrupado em minerais, vitaminas e gorduras.
 */
export function TotalNutrientesPanel({
  planoId,
  abertoInicial = true,
  semCard = false,
}: Props) {
  const [aberto, setAberto] = useState(abertoInicial);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["nutrientes-plano", planoId],
    queryFn: () => nutrientesService.doPlano(planoId),
    enabled: aberto && Number.isFinite(planoId),
    staleTime: 60_000,
  });

  const grupos = useMemo(() => {
    if (!data) return [];
    return ORDEM_GRUPOS.map((g) => ({
      ...g,
      itens: data.totais.filter((t) => t.grupo === g.id),
    })).filter((g) => g.itens.length > 0);
  }, [data]);

  const resumo = useMemo(() => {
    if (!data) return null;
    const comRef = data.totais.filter((t) => t.percentual !== null);
    const criticos = comRef.filter((t) => faixa(t) === "critico");
    const acima = comRef.filter((t) => faixa(t) === "acima");
    return { total: comRef.length, criticos, acima };
  }, [data]);

  const conteudo = (
    <>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Ver total de nutrientes
            </CardTitle>
            <CardDescription>
              Total prescrito no plano comparado com a recomendação diária.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="shrink-0"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", aberto && "rotate-180")}
            />
            {aberto ? "Recolher" : "Ver"}
          </Button>
        </div>
      </CardHeader>

      {aberto && (
        <CardContent className="space-y-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Calculando nutrientes…
            </p>
          )}

          {isError && (
            <p className="text-sm text-destructive">
              Não foi possível calcular.{" "}
              {(error as { message?: string })?.message ?? ""}
            </p>
          )}

          {data && (
            <>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {data.contexto.sexo === "F" ? "Mulher" : "Homem"},{" "}
                {data.contexto.idadeAnos} anos · {data.contexto.referencia} ·{" "}
                {data.kcalTotal} kcal no plano
              </div>

              {resumo && resumo.criticos.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {resumo.criticos.length} de {resumo.total} nutrientes abaixo de 70% da
                    recomendação
                  </p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                    {resumo.criticos.map((t) => t.rotulo).join(", ")}
                  </p>
                </div>
              )}

              {data.cobertura.alimentosSemDados.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    Sem dados de micronutrientes (não entram na soma):{" "}
                    {data.cobertura.alimentosSemDados.join(", ")}
                  </p>
                </div>
              )}

              {grupos.map((g) => (
                <section key={g.id} className="space-y-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.rotulo}
                  </h3>
                  <ul className="divide-y divide-border rounded-lg border">
                    {g.itens.map((t) => (
                      <LinhaNutriente key={t.chave} t={t} />
                    ))}
                  </ul>
                </section>
              ))}

              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Referências de RDA/AI: Dietary Reference Intakes (IOM/National
                Academies). Alimentos sem dado do nutriente entram como zero na
                soma — o ícone de alerta indica que o total pode estar
                subestimado. Niacina e folato são aproximações (mg NE e mcg DFE).
              </p>
            </>
          )}
        </CardContent>
      )}
    </>
  );

  if (semCard) return <div className="space-y-3">{conteudo}</div>;

  return <Card>{conteudo}</Card>;
}
