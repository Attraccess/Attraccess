import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Form, FormField, FormSubmission, Resource } from '@attraccess/database-entities';
import { ResourceFormsController } from './forms.controller';
import { ResourceFormsService } from './forms.service';

@Module({
  imports: [TypeOrmModule.forFeature([Form, FormField, FormSubmission, Resource])],
  controllers: [ResourceFormsController],
  providers: [ResourceFormsService],
  exports: [ResourceFormsService],
})
export class ResourceFormsModule {}

