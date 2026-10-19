import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AnamneseService } from './anamnese.service';
import { CreateAnamneseDto } from './dto/create-anamnese.dto';
import { UpdateAnamneseDto } from './dto/update-anamnese.dto';

@ApiTags('Anamnese')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('anamneses')
export class AnamneseController {
  constructor(private readonly service: AnamneseService) {}

  @Post()
  create(
    @Body() dto: CreateAnamneseDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.service.create(dto, user);
  }

  @Get()
  @ApiQuery({ name: 'idPaciente', type: Number })
  findByPaciente(
    @Query('idPaciente', ParseIntPipe) idPaciente: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.service.findByPaciente(idPaciente, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnamneseDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.service.remove(id, user);
  }
}
