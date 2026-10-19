-- Nutricionistas auto-cadastrados ficam com conta inativa até aprovação do super admin.
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "conta_ativa" BOOLEAN NOT NULL DEFAULT true;
