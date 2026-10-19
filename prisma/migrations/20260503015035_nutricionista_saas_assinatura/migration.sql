-- AlterTable
ALTER TABLE "nutricionistas" ADD COLUMN     "dia_vencimento_saas" INTEGER,
ADD COLUMN     "plano_saas" VARCHAR(32),
ADD COLUMN     "proximo_vencimento_saas" DATE,
ADD COLUMN     "ultimo_pagamento_saas_em" TIMESTAMP(3);
