import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Form, FormField, FormSubmission, Resource } from '@attraccess/database-entities';
import { RESOURCE_FORM_STORE } from '../../../resources/forms/forms-store.port';
import { TypeOrmResourceFormStore } from './resource-form-store.adapter';

/** TypeORM-backed implementation of the resource form port. */
@Module({
  imports: [TypeOrmModule.forFeature([Form, FormField, FormSubmission, Resource])],
  providers: [{ provide: RESOURCE_FORM_STORE, useClass: TypeOrmResourceFormStore }],
  exports: [RESOURCE_FORM_STORE],
})
export class FormsPersistenceModule {}
