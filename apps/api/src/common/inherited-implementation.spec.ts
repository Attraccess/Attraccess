import 'reflect-metadata';
import { MetadataScanner } from '@nestjs/core';
import { installInheritedMethods } from './inherited-implementation';

it('preserves facade method order, function identity, and decorator metadata', () => {
  class Base {
    first() {
      return 'first';
    }
    second() {
      return 'second';
    }
  }
  class Facade extends Base {
    third() {
      return 'third';
    }
  }
  Reflect.defineMetadata('route', '/first', Base.prototype.first);
  installInheritedMethods(Facade, ['first', 'third', 'second']);
  expect(new MetadataScanner().getAllMethodNames(Facade.prototype)).toEqual(['first', 'third', 'second']);
  expect(Facade.prototype.first).toBe(Base.prototype.first);
  expect(Reflect.getMetadata('route', Facade.prototype.first)).toBe('/first');
  expect(new Facade().first()).toBe('first');
});
