import { Module } from '@nestjs/common';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { ConfigModule } from '@nestjs/config';
import { FormsPersistenceModule } from '../../database/adapters/resources/forms-persistence.module';
import { SettingsModule } from '../../settings/settings.module';
import { FormsController } from './global-forms.controller';
import { ResourceFormsController } from './forms.controller';
import { ResourceFormsService } from './forms.service';
import { FormImageCleanupService } from './images/form-image-cleanup.service';
import { FormImageFileStorage } from './images/form-image-file-storage';
import { FormImageHandoffService } from './images/form-image-handoff.service';
import { FormImageViewerGuard } from './images/form-image-viewer.guard';
import { FormImagesController } from './images/form-images.controller';
import { FormImagesService } from './images/form-images.service';
import { FormPhotoController } from './images/form-photo.controller';
import { FormPhotoRateLimitGuard } from './images/form-photo-rate-limit.guard';

@Module({
  imports: [FormsPersistenceModule, SettingsModule, ConfigModule],
  controllers: [FormsController, ResourceFormsController, FormImagesController, FormPhotoController],
  providers: [
    ResourceFormsService,
    FormImageFileStorage,
    FormImagesService,
    FormImageHandoffService,
    FormImageCleanupService,
    FormPhotoRateLimitGuard,
    DualAuthGuard,
    FormImageViewerGuard,
  ],
  exports: [ResourceFormsService, FormImageHandoffService],
})
export class ResourceFormsModule {}
