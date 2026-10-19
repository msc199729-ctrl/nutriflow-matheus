import { PartialType } from '@nestjs/swagger';
import { CreateLancamentoFinanceiroDto } from './create-lancamento-financeiro.dto';

export class UpdateLancamentoFinanceiroDto extends PartialType(
  CreateLancamentoFinanceiroDto,
) {}
