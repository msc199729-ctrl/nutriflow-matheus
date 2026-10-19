import { PartialType } from '@nestjs/swagger';
import { CreateModeloFormularioDto } from './create-modelo-formulario.dto';

export class UpdateModeloFormularioDto extends PartialType(
  CreateModeloFormularioDto,
) {}
