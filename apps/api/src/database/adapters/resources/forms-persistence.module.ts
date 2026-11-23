import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Form, FormField, FormImage, FormImageHandoff, FormSubmission, Resource } from '@attraccess/database-entities';
import { RESOURCE_FORM_STORE } from '../../../resources/forms/forms-store.port';
import { FORM_IMAGE_STORE } from '../../../resources/forms/images/form-image-store.port';
import { TypeOrmFormImageStore } from './form-image-store.adapter';
import { TypeOrmResourceFormStore } from './resource-form-store.adapter';

/** TypeORM-backed implementations of the resource form port and the form image port. */
@Module({
  imports: [TypeOrmModule.forFeature([Form, FormField, FormSubmission, FormImage, FormImageHandoff, Resource])],
  providers: [
    { provide: RESOURCE_FORM_STORE, useClass: TypeOrmResourceFormStore },
    { provide: FORM_IMAGE_STORE, useClass: TypeOrmFormImageStore },
  ],
  exports: [RESOURCE_FORM_STORE, FORM_IMAGE_STORE],
})
export class FormsPersistenceModule {}
