import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateAvaliacaoFisicaDto {
  @ApiProperty({ description: 'ID do paciente' })
  @IsInt()
  @Min(1)
  idPaciente: number;

  @ApiPropertyOptional({ description: 'Data da avaliação (ISO date)' })
  @IsOptional()
  @IsDateString()
  data?: string;

  // ── Medidas básicas ──────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Peso em kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  peso?: number;

  @ApiPropertyOptional({ description: 'Altura em metros' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  altura?: number;

  @ApiPropertyOptional({ description: 'Altura sentado em cm' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  alturaSentadoCm?: number;

  @ApiPropertyOptional({ description: 'Altura do joelho em cm' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  alturaJoelhoCm?: number;

  // ── Composição corporal ──────────────────────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  percentualGordura?: number;

  // ── Dobras cutâneas ──────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Protocolo/fórmula de gordura (ex: Pollock 3, Pollock 7, Petroski)' })
  @IsOptional()
  @IsString()
  protocoloGordura?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraTricipital?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraBicipital?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraSubescapular?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraAxilarMedia?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraToracica?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraAbdominal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraSuprailiaca?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraSupraEspinhal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraCoxa?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dobraPanturrilha?: number;

  // ── Circunferências únicas (tronco) ──────────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circPescoco?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circOmbro?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circTorax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circCintura?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circAbdomen?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circQuadril?: number;

  // ── Circunferências bilaterais — Braço ───────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circBracoDirRelaxado?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circBracoEsqRelaxado?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circBracoDirContraido?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circBracoEsqContraido?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circBracoDirCmb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circBracoEsqCmb?: number;

  // ── Circunferências bilaterais — Antebraço ───────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circAntebracoDirBraco?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circAntebracoEsq?: number;

  // ── Circunferências bilaterais — Coxa ────────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circCoxaProximalDir?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circCoxaProximalEsq?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circCoxaMedialDir?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circCoxaMedialEsq?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circCoxaDistalDir?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circCoxaDistalEsq?: number;

  // ── Circunferências bilaterais — Panturrilha ─────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circPanturrilhaDir?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  circPanturrilhaEsq?: number;

  // ── Bioimpedância ────────────────────────────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  biaPercentualGordura?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  biaClassificacaoGordura?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  biaPercentualMassaMuscular?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  biaMassaMuscularKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  biaAguaCorporalTotalKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  biaMassaOsseaKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  biaIndiceGorduraVisceral?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  biaIdadeMetabolica?: number;

  // ── Fotos ────────────────────────────────────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  urlFotoFrente?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  urlFotoCostas?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  urlFotoLado?: string;
}
