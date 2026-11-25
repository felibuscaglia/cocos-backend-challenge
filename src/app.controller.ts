import { Controller, Get, HttpStatus } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from './common/dto';

@ApiTags('General')
@Controller()
export class AppController {
  constructor() {}

  @Get()
  @ApiOperation({ summary: 'Información básica de la API' })
  @ApiOkResponse({
    description: 'Nombre, descripción y autor de la API.',
  })
  @ApiInternalServerErrorResponse({
    description: 'Error inesperado del servidor.',
    type: ErrorResponseDto,
    example: {
      statusCode: 500,
      message: 'Error interno del servidor',
      error: 'Internal Server Error',
      path: '/',
      timestamp: '2026-11-24T15:30:00.000Z',
    },
  })
  getInfo() {
    return {
      statusCode: HttpStatus.OK,
      name: 'Cocos Backend Challenge',
      description: 'API REST de portfolio, búsqueda de activos y órdenes.',
      author: 'Felipe Buscaglia',
    };
  }
}
