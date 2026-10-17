import { DataSource } from 'typeorm';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { FormsPersistence, FORM_OPERATIONS } from './persistence/port';
import { TypeormFormsPersistence } from './persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Form, FormField, FormSubmission, Resource } from '@attraccess/database-entities';
import { ResourceFormsController } from './forms.controller';
import { ResourceFormsService } from './forms.service';

@Module({
  imports: [TypeOrmModule.forFeature([Form, FormField, FormSubmission, Resource])],
  controllers: [ResourceFormsController],
  providers: [
    {
      provide: FormsPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(FORM_OPERATIONS, (manager) => new TypeormFormsPersistence(manager));
        return new TypeormFormsPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    ResourceFormsService,
  ],
  exports: [ResourceFormsService],
})
export class ResourceFormsModule {}
