import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Exige que el objeto tenga exactamente uno de los campos indicados (distinto de undefined).
 * Valida el objeto entero, así que conviene ponerlo en una propiedad que siempre se valide.
 */
export function ExactlyOneOf(
  fields: string[],
  validationOptions?: ValidationOptions,
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
          fields.filter(
            (field) =>
              (args!.object as Record<string, unknown>)[field] !== undefined,
          ).length === 1,
      },
    });
  };
}
