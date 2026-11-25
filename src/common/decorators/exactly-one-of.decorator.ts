import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Exige que el objeto tenga exactamente uno de los campos indicados (distinto de undefined).
 * Valida el objeto entero, así que conviene ponerlo en una propiedad que siempre se valide.
 * Si se pasa `when` y devuelve false, la regla no se aplica.
 */
export function ExactlyOneOf<T extends object>(
  fields: string[],
  validationOptions?: ValidationOptions,
  when?: (object: T) => boolean,
): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'exactlyOneOf',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: fields,
      options: validationOptions,
      validator: {
        validate: (_value, args) =>
          (when !== undefined && !when(args!.object as T)) ||
          fields.filter(
            (field) =>
              (args!.object as Record<string, unknown>)[field] !== undefined,
          ).length === 1,
      },
    });
  };
}
