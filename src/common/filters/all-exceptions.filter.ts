import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { QueryFailedError } from 'typeorm';

// Códigos SQLSTATE de Postgres que son errores del pedido y no del servidor.
const PG_ERRORS: Record<string, { status: HttpStatus; message: string }> = {
  '23503': {
    status: HttpStatus.NOT_FOUND,
    message: 'El recurso referenciado no existe',
  },
  '23505': { status: HttpStatus.CONFLICT, message: 'El recurso ya existe' },
  '22P02': { status: HttpStatus.BAD_REQUEST, message: 'Formato inválido' },
  '22003': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Valor numérico fuera de rango',
  },
  '23514': {
    status: HttpStatus.BAD_REQUEST,
    message: 'El valor no cumple una restricción',
  },
  '23502': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Falta un valor obligatorio',
  },
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { status, message } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: STATUS_CODES[status],
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private resolve(exception: unknown): {
    status: number;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
      return { status: exception.getStatus(), message };
    }

    if (exception instanceof QueryFailedError) {
      const code = (exception.driverError as { code?: string }).code;
      const pgError = code ? PG_ERRORS[code] : undefined;
      if (pgError) return pgError;
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
    };
  }
}
