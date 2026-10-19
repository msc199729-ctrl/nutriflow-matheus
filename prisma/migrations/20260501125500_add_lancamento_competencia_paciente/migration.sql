-- AlterTable
ALTER TABLE "lancamentos_financeiros"
ADD COLUMN "id_paciente" INTEGER,
ADD COLUMN "competencia" VARCHAR(7),
ADD COLUMN "origem" TEXT;

-- CreateIndex
CREATE INDEX "lancamentos_financeiros_id_workspace_competencia_idx" ON "lancamentos_financeiros"("id_workspace", "competencia");

-- AddForeignKey
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
