-- ============================================================================
-- Micronutrientes em base_alimentos
--
-- ATENÇÃO: este projeto pode já ter essas colunas (frente "micros completos"
-- aplicada antes). Por isso TODA linha usa IF NOT EXISTS: se a coluna existe,
-- não faz nada; se falta alguma, cria com o nome certo.
--
-- Os nomes abaixo seguem o model BaseAlimento do schema.prisma deste projeto
-- (vitamina_a_rae, gordura_saturada, ...), e não uma nomenclatura paralela.
--
-- Rodar esta migração num banco que já tem tudo é seguro e não altera dado.
-- ============================================================================

-- ── Minerais ────────────────────────────────────────────────────────────────
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "calcio"       DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "ferro"        DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "magnesio"     DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "fosforo"      DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "potassio"     DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "zinco"        DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "cobre"        DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "selenio"      DOUBLE PRECISION;

-- ── Vitaminas ───────────────────────────────────────────────────────────────
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "vitamina_a_re"  DOUBLE PRECISION;  -- mcg RE
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "vitamina_a_rae" DOUBLE PRECISION;  -- mcg RAE
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "vitamina_c"     DOUBLE PRECISION;  -- mg
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "vitamina_d"     DOUBLE PRECISION;  -- mcg
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "vitamina_e"     DOUBLE PRECISION;  -- mg
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "tiamina"        DOUBLE PRECISION;  -- mg (B1)
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "vitamina_b2"    DOUBLE PRECISION;  -- mg
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "vitamina_b3"    DOUBLE PRECISION;  -- mg
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "vitamina_b6"    DOUBLE PRECISION;  -- mg
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "vitamina_b12"   DOUBLE PRECISION;  -- mcg
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "folato"         DOUBLE PRECISION;  -- mcg

-- ── Gorduras ────────────────────────────────────────────────────────────────
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "colesterol"              DOUBLE PRECISION;  -- mg
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "gordura_saturada"        DOUBLE PRECISION;  -- g
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "gordura_monoinsaturada"  DOUBLE PRECISION;  -- g
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "gordura_poliinsaturada"  DOUBLE PRECISION;  -- g
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "gordura_trans"           DOUBLE PRECISION;  -- g

-- ── Outros (só se ainda não existirem) ──────────────────────────────────────
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "umidade"            DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "carboidrato_total"  DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "acucar_adicao"      DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "sal_adicao"         DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "alcool"             DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "nome_exibicao"      TEXT;
ALTER TABLE "base_alimentos" ADD COLUMN IF NOT EXISTS "nome_busca"         TEXT;

-- ============================================================================
-- Distribuição de macros no cálculo energético.
-- Condicional: a tabela pode não existir nesta cópia do projeto.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'calculos_energeticos'
  ) THEN
    ALTER TABLE "calculos_energeticos" ADD COLUMN IF NOT EXISTS "proteinas_g_kg"    DOUBLE PRECISION;
    ALTER TABLE "calculos_energeticos" ADD COLUMN IF NOT EXISTS "lipidios_g_kg"     DOUBLE PRECISION;
    ALTER TABLE "calculos_energeticos" ADD COLUMN IF NOT EXISTS "carboidratos_g_kg" DOUBLE PRECISION;
  ELSE
    RAISE NOTICE 'Tabela calculos_energeticos ausente — colunas de distribuicao nao criadas.';
  END IF;
END $$;
