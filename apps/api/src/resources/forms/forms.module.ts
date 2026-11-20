import { Module } from '@nestjs/common';
import { FormsPersistenceModule } from '../../database/adapters/resources/forms-persistence.module';
import { ResourceFormsController } from './forms.controller';
import { ResourceFormsService } from './forms.service';

@Module({
  imports: [FormsPersistenceModule],
  controllers: [ResourceFormsController],
  providers: [ResourceFormsService],
  exports: [ResourceFormsService],
})
export class ResourceFormsModule {}
