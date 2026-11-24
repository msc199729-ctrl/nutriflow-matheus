"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TotalNutrientesPanel } from "@/components/diet/total-nutrientes-panel";

interface Props {
  planoId: number | null;
  nomePlano?: string | null;
  onOpenChange: (v: boolean) => void;
}

/**
 * Dialog "Ver total de nutrientes" de um plano salvo.
 *
 * Aberto pelo ícone de gráfico na linha do plano, ao lado do carrinho
 * (lista de compras) e do lápis (renomear).
 */
export function NutrientesDialog({ planoId, nomePlano, onOpenChange }: Props) {
  return (
    <Dialog open={planoId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[min(90vh,760px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Total de nutrientes</DialogTitle>
          <DialogDescription>
            {nomePlano?.trim() || (planoId ? `Plano #${planoId}` : "")}
            {" — "}
            total prescrito comparado com a recomendação diária.
          </DialogDescription>
        </DialogHeader>

        {planoId !== null && (
          <TotalNutrientesPanel planoId={planoId} semCard />
        )}
      </DialogContent>
    </Dialog>
  );
}
