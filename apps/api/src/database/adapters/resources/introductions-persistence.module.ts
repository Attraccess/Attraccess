import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceUsage,
} from '@attraccess/database-entities';
import { RESOURCE_INTRODUCTION_STORE } from '../../../resources/introductions/resource-introduction-store.port';
import { RESOURCE_RETRAINING_STORE } from '../../../resources/retraining/retraining-store.port';
import { MASS_INTRODUCTION_TARGET_STORE } from '../../../resources/mass-introductions/mass-introduction-target-store.port';
import { TypeOrmResourceIntroductionStore } from './resource-introduction-store.adapter';
import { TypeOrmMassIntroductionTargetStore, TypeOrmRetrainingStore } from './retraining-store.adapter';

/** TypeORM-backed implementations of the introduction, retraining and mass introduction target ports. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceGroup,
      ResourceUsage,
      ResourceIntroduction,
      ResourceIntroductionHistoryItem,
    ]),
  ],
  providers: [
    { provide: RESOURCE_INTRODUCTION_STORE, useClass: TypeOrmResourceIntroductionStore },
    { provide: RESOURCE_RETRAINING_STORE, useClass: TypeOrmRetrainingStore },
    { provide: MASS_INTRODUCTION_TARGET_STORE, useClass: TypeOrmMassIntroductionTargetStore },
  ],
  exports: [RESOURCE_INTRODUCTION_STORE, RESOURCE_RETRAINING_STORE, MASS_INTRODUCTION_TARGET_STORE],
})
export class IntroductionsPersistenceModule {}
