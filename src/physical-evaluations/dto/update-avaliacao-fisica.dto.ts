import { PartialType } from '@nestjs/swagger';
import { CreateAvaliacaoFisicaDto } from './create-avaliacao-fisica.dto';

export class UpdateAvaliacaoFisicaDto extends PartialType(
  CreateAvaliacaoFisicaDto,
) {
  /* idPaciente removido: não se altera paciente da avaliação */
}
