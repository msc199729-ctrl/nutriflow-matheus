-- CreateTable
CREATE TABLE "anamneses" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queixa_principal" TEXT,
    "historia_doenca_atual" TEXT,
    "patologias" TEXT,
    "medicamentos" TEXT,
    "suplementos" TEXT,
    "alergias" TEXT,
    "intolerancias" TEXT,
    "historico_familiar" TEXT,
    "habitos_alimentares" TEXT,
    "restricoes_alimentares" TEXT,
    "frequencia_alimentar" TEXT,
    "ingestao_hidrica" TEXT,
    "funcionamento_intestinal" TEXT,
    "qualidade_sono" TEXT,
    "atividade_fisica" TEXT,
    "nivel_estresse" TEXT,
    "tabagismo" TEXT,
    "etilismo" TEXT,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anamneses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
