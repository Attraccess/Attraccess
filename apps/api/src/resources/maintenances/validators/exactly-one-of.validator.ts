import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validates that exactly one of the given property names has a truthy value (and the rest are null/undefined/0).
 * Use on a class; the constraint receives the whole object.
 */
export function ExactlyOneOf(
  propertyNames: [string, string],
  validationOptions?: ValidationOptions
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'exactlyOneOf',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [propertyNames],
      validator: ExactlyOneOfConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'exactlyOneOf', async: false })
export class ExactlyOneOfConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const [props] = args.constraints as [ [string, string] ];
    const obj = args.object as Record<string, unknown>;
    const a = obj[props[0]];
    const b = obj[props[1]];
    const hasA = a != null && a !== '';
    const hasB = b != null && b !== '';
    const numA = Number(a);
    const numB = Number(b);
    const setA = hasA && !Number.isNaN(numA) && numA > 0;
    const setB = hasB && !Number.isNaN(numB) && numB > 0;
    return (setA && !setB) || (!setA && setB);
  }

  defaultMessage(args: ValidationArguments) {
    const [props] = args.constraints as [ [string, string] ];
    return `Exactly one of ${props[0]} or ${props[1]} must be set (and positive).`;
  }
}
