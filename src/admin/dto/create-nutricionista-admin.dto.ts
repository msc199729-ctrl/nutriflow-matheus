import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PLANOS_SAAS } from '../../common/saas-billing.util';

export class CreateNutricionistaAdminDto {
  @ApiProperty({ description: 'ID do workspace (clínica) onde o nutricionista atuará' })
  @IsInt()
  workspaceId: number;

  @ApiProperty({ example: 'nutri@clinica.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'senhaSegura123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })
  senha: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nome?: string;

  @ApiPropertyOptional({
    description: 'Número do registro no conselho (CRN ou CRM conforme tipoConselho)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  crn?: string;

  @ApiPropertyOptional({
    enum: ['crn', 'crm'],
    default: 'crn',
    description: 'Tipo do conselho do número em `crn`',
  })
  @IsOptional()
  @IsIn(['crn', 'crm'])
  tipoConselho?: 'crn' | 'crm';

  @ApiPropertyOptional({
    enum: PLANOS_SAAS,
    description: 'Se informado com dia de vencimento, agenda a primeira cobrança SaaS.',
  })
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
}
