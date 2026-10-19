-- CreateEnum
CREATE TYPE "TipoLancamentoFinanceiro" AS ENUM ('receita', 'despesa');

-- CreateEnum
CREATE TYPE "StatusLancamentoFinanceiro" AS ENUM ('pendente', 'pago', 'atrasado');

-- CreateTable
CREATE TABLE "lancamentos_financeiros" (
    "id" SERIAL NOT NULL,
    "id_workspace" INTEGER NOT NULL,
    "id_responsavel" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "paciente_nome" TEXT,
    "categoria" TEXT,
    "tipo" "TipoLancamentoFinanceiro" NOT NULL,
    "status" "StatusLancamentoFinanceiro" NOT NULL DEFAULT 'pendente',
    "valor" DOUBLE PRECISION NOT NULL,
    "vencimento" DATE NOT NULL,
    "pago_em" DATE,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lancamentos_financeiros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lancamentos_financeiros_id_workspace_vencimento_idx" ON "lancamentos_financeiros"("id_workspace", "vencimento");

-- CreateIndex
CREATE INDEX "lancamentos_financeiros_id_workspace_status_idx" ON "lancamentos_financeiros"("id_workspace", "status");

-- CreateIndex
CREATE INDEX "lancamentos_financeiros_id_responsavel_idx" ON "lancamentos_financeiros"("id_responsavel");

-- AddForeignKey
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_id_workspace_fkey" FOREIGN KEY ("id_workspace") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_id_responsavel_fkey" FOREIGN KEY ("id_responsavel") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
