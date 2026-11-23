CREATE TABLE "calculos_energeticos" (
    "id" SERIAL NOT NULL,
    "idPaciente" INTEGER NOT NULL,
    "idPlanoAlimentar" INTEGER,
    "pesoKg" DOUBLE PRECISION NOT NULL,
    "alturaCm" DOUBLE PRECISION NOT NULL,
    "idadeAnos" INTEGER NOT NULL,
    "sexo" TEXT NOT NULL,
    "massaMagraKg" DOUBLE PRECISION,
    "formula" TEXT NOT NULL,
    "fatorAtividade" DOUBLE PRECISION NOT NULL DEFAULT 1.55,
    "fatorInjuria" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "eerNivel" TEXT,
    "adicionalMet" DOUBLE PRECISION,
    "adicionalVenta" DOUBLE PRECISION,
    "adicional_gestante" DOUBLE PRECISION,
    "tmbKcal" DOUBLE PRECISION NOT NULL,
    "getKcal" DOUBLE PRECISION NOT NULL,
    "metodoDistribuicao" TEXT,
    "proteinasGKg" DOUBLE PRECISION,
    "lipidiosGKg" DOUBLE PRECISION,
    "carboidratosGKg" DOUBLE PRECISION,
    "proteinasPct" DOUBLE PRECISION,
    "lipidiosPct" DOUBLE PRECISION,
    "carboidratosPct" DOUBLE PRECISION,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calculos_energeticos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calculos_energeticos_idPlanoAlimentar_key" ON "calculos_energeticos"("idPlanoAlimentar");
CREATE INDEX "calculos_energeticos_idPaciente_idx" ON "calculos_energeticos"("idPaciente");

ALTER TABLE "calculos_energeticos" ADD CONSTRAINT "calculos_energeticos_idPaciente_fkey" FOREIGN KEY ("idPaciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calculos_energeticos" ADD CONSTRAINT "calculos_energeticos_idPlanoAlimentar_fkey" FOREIGN KEY ("idPlanoAlimentar") REFERENCES "planos_alimentares"("id") ON DELETE SET NULL ON UPDATE CASCADE;