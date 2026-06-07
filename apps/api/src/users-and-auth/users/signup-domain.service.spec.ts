import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Setting } from '@attraccess/database-entities';
import { SignupDomainService } from './signup-domain.service';

describe('SignupDomainService', () => {
  let service: SignupDomainService;
  let settingRepository: {
    findOne: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignupDomainService,
        {
          provide: getRepositoryToken(Setting),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SignupDomainService>(SignupDomainService);
    settingRepository = module.get(getRepositoryToken(Setting));
  });

  it('getWhitelist should return default "*" when missing', async () => {
    settingRepository.findOne.mockResolvedValue(null);
    const result = await service.getWhitelist();
    expect(result).toEqual(['*']);
  });

  it('getWhitelist should parse and normalize domains', async () => {
    settingRepository.findOne.mockResolvedValue({ value: ' Example.COM ,allowed.org,  ,Another.Net ' });
    const result = await service.getWhitelist();
    expect(result).toEqual(['example.com', 'allowed.org', 'another.net']);
  });

  it('setWhitelist should update repository with joined list', async () => {
    await service.setWhitelist(['example.com', 'allowed.org']);
    expect(settingRepository.update).toHaveBeenCalledWith(
      { parent: 'auth', key: 'local_signup_domain_whitelist' },
      { value: 'example.com,allowed.org' },
    );
  });

  it('isLocalSignupEnabled should return false when list is empty', async () => {
    settingRepository.findOne.mockResolvedValue({ value: '' });
    const result = await service.isLocalSignupEnabled();
    expect(result).toBe(false);
  });

  it('isLocalSignupEnabled should return true when list has any value', async () => {
    settingRepository.findOne.mockResolvedValue({ value: '*' });
    const result = await service.isLocalSignupEnabled();
    expect(result).toBe(true);
  });
});
