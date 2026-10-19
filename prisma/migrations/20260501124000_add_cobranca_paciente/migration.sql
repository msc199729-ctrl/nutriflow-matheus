-- CreateTable
CREATE TABLE "cobrancas_pacientes" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "id_workspace" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "valor_mensal" DOUBLE PRECISION NOT NULL,
    "dia_vencimento" INTEGER NOT NULL,
    "inicio_cobranca" DATE NOT NULL,
    "categoria" TEXT DEFAULT 'Mensalidade',
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobrancas_pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_pacientes_id_paciente_key" ON "cobrancas_pacientes"("id_paciente");

-- CreateIndex
CREATE INDEX "cobrancas_pacientes_id_workspace_ativa_idx" ON "cobrancas_pacientes"("id_workspace", "ativa");

-- AddForeignKey
ALTER TABLE "cobrancas_pacientes" ADD CONSTRAINT "cobrancas_pacientes_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas_pacientes" ADD CONSTRAINT "cobrancas_pacientes_id_workspace_fkey" FOREIGN KEY ("id_workspace") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
