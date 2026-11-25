import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { typeOrmOptions } from './typeorm-options';

// La CLI corre fuera de Nest: este ConfigService solo lee process.env
// (cargado con --env-file-if-exists en los scripts) y no aplica la validación Joi.
export default new DataSource(typeOrmOptions(new ConfigService()));
