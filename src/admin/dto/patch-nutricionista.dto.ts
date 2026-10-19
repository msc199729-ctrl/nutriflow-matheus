import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PLANOS_SAAS } from '../../common/saas-billing.util';

export class PatchNutricionistaDto {
  @ApiPropertyOptional({ description: 'Bloquear ou desbloquear a conta do nutricionista (bloqueio administrativo)' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  bloqueado?: boolean;

  @ApiPropertyOptional({
    description:
      'Ativar conta após cadastro público (aprovação do super administrador) ou desativar acesso sem bloquear definitivamente',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  contaAtiva?: boolean;

  @ApiPropertyOptional({
    description:
      'Workspace (clínica) do nutricionista. Obrigatório na mesma requisição ao aprovar cadastro público (`contaAtiva: true`) se ainda não houver workspace; pode ser enviado antes da aprovação para pré-vincular.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workspaceId?: number;

  @ApiPropertyOptional({
    description:
      'Registra pagamento da mensalidade: avança o próximo vencimento e desbloqueia o acesso se estava suspenso por inadimplência.',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  registrarPagamentoMensalidade?: boolean;

  @ApiPropertyOptional({ enum: PLANOS_SAAS })
  @IsOptional()
  @IsIn([...PLANOS_SAAS])
  planoSaas?: (typeof PLANOS_SAAS)[number];

  @ApiPropertyOptional({ description: 'Dia do mês (1–28) do vencimento da mensalidade' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimentoSaas?: number;

  @ApiPropertyOptional({
    description: 'Ajuste manual da próxima data de vencimento (ISO 8601, apenas data)',
  })
  @IsOptional()
  @IsDateString()
  proximoVencimentoSaas?: string;
}
