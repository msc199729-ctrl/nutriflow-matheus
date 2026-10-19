import { PartialType } from '@nestjs/swagger';
import { CreatePerguntaDto } from './create-pergunta.dto';

export class UpdatePerguntaDto extends PartialType(CreatePerguntaDto) {}
