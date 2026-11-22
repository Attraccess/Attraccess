import { Module } from '@nestjs/common';
import { FormsPersistenceModule } from '../../database/adapters/resources/forms-persistence.module';
import { FormsController } from './global-forms.controller';
import { ResourceFormsController } from './forms.controller';
import { ResourceFormsService } from './forms.service';
import { ResourceListVisibilityModule } from '../visibility/resource-list-visibility.module';

@Module({
  imports: [ResourceListVisibilityModule, FormsPersistenceModule],
  controllers: [FormsController, ResourceFormsController],
  providers: [ResourceFormsService],
  exports: [ResourceFormsService],
})
export class ResourceFormsModule {}
