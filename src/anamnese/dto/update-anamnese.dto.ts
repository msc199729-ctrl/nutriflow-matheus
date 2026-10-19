import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateAnamneseDto } from './create-anamnese.dto';

export class UpdateAnamneseDto extends PartialType(
  OmitType(CreateAnamneseDto, ['idPaciente'] as const),
) {}
