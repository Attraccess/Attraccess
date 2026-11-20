import { ApiProperty, getSchemaPath } from '@nestjs/swagger';

/**
 * Declares a property that refers to the published `User` schema without importing the persistence entity that
 * defines it. The generated API description stays the same as when the property was typed with the entity class.
 */
export function UserSchemaRef(options: { description: string; nullable?: boolean }): PropertyDecorator {
  const ref = { $ref: getSchemaPath('User') };
  return ApiProperty({
    description: options.description,
    ...(options.nullable ? { nullable: true, allOf: [ref] } : ref),
  });
}
