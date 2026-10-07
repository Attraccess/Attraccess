import { ResourceBillingConfiguration } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BillingServiceRouteContext } from './billing.service.route-context';
import { BillingConfigurationDto } from './dto/configuration.dto';
import { Currency, SetBillingConfigurationDto } from './dto/set-configuration.dto';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';
import { ResourceBillingConfigurationNotFoundException } from './errors/resource-billing-configuration-not-found.error';
import { ResourceBillingConfigurationChangedEvent } from './events/resource-billing-configuration-changed.event';
export abstract class BillingConfigurationImplementation extends BillingServiceRouteContext {
  async setConfiguration(nextConfigurationData: SetBillingConfigurationDto): Promise<BillingConfigurationDto> {
    if (!Object.values(Currency).includes(nextConfigurationData.currency)) {
      throw new BadRequestException('Invalid currency');
    }

    const existingCurrency = await this.settingRepository.findOneBy({
      parent: 'billing',
      key: 'currency',
    });

    if (existingCurrency) {
      await this.settingRepository.update(existingCurrency.id, {
        value: nextConfigurationData.currency,
      });
    } else {
      await this.settingRepository.insert({
        parent: 'billing',
        key: 'currency',
        value: nextConfigurationData.currency,
      });
    }

    return await this.getConfiguration();
  }

  public async getConfiguration(): Promise<BillingConfigurationDto> {
    const currency = await this.settingRepository.findOneBy({
      parent: 'billing',
      key: 'currency',
    });
    let currencyValue = Currency.EUR;
    if (currency) {
      currencyValue = (currency.value as Currency) ?? Currency.EUR;
    }

    let minorUnit: number;
    switch (currencyValue) {
      case Currency.EUR:
        minorUnit = 2;
        break;

      default: {
        const exhaustiveCheck: never = currencyValue;
        throw new Error(`Unsupported currency: ${exhaustiveCheck}`);
      }
    }

    return {
      currency: currencyValue,
      minorUnit,
    };
  }

  public async getResourceBillingConfiguration(
    resourceId: number,
    transactionManager?: EntityManager,
  ): Promise<ResourceBillingConfiguration> {
    const repository = transactionManager
      ? transactionManager.getRepository(ResourceBillingConfiguration)
      : this.resourceBillingConfigurationRepository;

    let configuration = await repository.findOneBy({ resourceId });
    if (!configuration) {
      configuration = repository.create({
        resourceId,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      });
      configuration = await repository.save(configuration);
    }
    return configuration;
  }

  public async updateResourceBillingConfiguration(
    resourceId: number,
    data: UpdateResourceBillingConfigurationDto,
  ): Promise<ResourceBillingConfiguration> {
    const configuration = await this.resourceBillingConfigurationRepository.findOneBy({ resourceId });
    if (!configuration) {
      throw new ResourceBillingConfigurationNotFoundException(resourceId);
    }

    if (data.creditsPerMinute === null) {
      data.creditsPerMinute = 0;
    }
    if (data.creditsPerMinute !== undefined) {
      if (data.creditsPerMinute < 0) {
        throw new BadRequestException('Credits per minute cannot be negative');
      }
      configuration.creditsPerMinute = data.creditsPerMinute;
    }

    if (data.creditsPerOperatingMinute === null) {
      data.creditsPerOperatingMinute = 0;
    }
    if (data.creditsPerOperatingMinute !== undefined) {
      if (data.creditsPerOperatingMinute < 0) {
        throw new BadRequestException('Credits per operating minute cannot be negative');
      }
      configuration.creditsPerOperatingMinute = data.creditsPerOperatingMinute;
    }

    if (data.creditsPerUsage === null) {
      data.creditsPerUsage = 0;
    }
    if (data.creditsPerUsage !== undefined) {
      if (data.creditsPerUsage < 0) {
        throw new BadRequestException('Credits per usage cannot be negative');
      }
      configuration.creditsPerUsage = data.creditsPerUsage;
    }

    if (data.creditsPerUsage !== undefined && data.creditsPerUsage % 1 !== 0) {
      throw new BadRequestException('Credits per usage must be an integer (multiply by currency minor unit)');
    }

    if (data.creditsPerMinute !== undefined && data.creditsPerMinute % 1 !== 0) {
      throw new BadRequestException('Credits per minute must be an integer (multiply by currency minor unit)');
    }
    if (data.creditsPerOperatingMinute !== undefined && data.creditsPerOperatingMinute % 1 !== 0) {
      throw new BadRequestException(
        'Credits per operating minute must be an integer (multiply by currency minor unit)',
      );
    }

    const savedConfiguration = await this.resourceBillingConfigurationRepository.save(configuration);
    this.eventEmitter.emit(
      ResourceBillingConfigurationChangedEvent.EVENT_NAME,
      new ResourceBillingConfigurationChangedEvent(resourceId),
    );
    return savedConfiguration;
  }
}
