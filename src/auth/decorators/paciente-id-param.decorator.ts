import { SetMetadata } from '@nestjs/common';
import { PACIENTE_ID_PARAM_KEY } from '../guards/nutricionista-paciente.guard';

/**
 * Indica ao NutricionistaPacienteGuard qual parâmetro (params ou query) contém o id do paciente.
 * Use em rotas onde o recurso está vinculado a um paciente (ex.: idPaciente na query).
 */
export const PacienteIdParam = (paramName: string) =>
  SetMetadata(PACIENTE_ID_PARAM_KEY, paramName);
