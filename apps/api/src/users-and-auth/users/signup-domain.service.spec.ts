import { SignupDomainPersistence } from './persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { SignupDomainService } from './signup-domain.service';

describe('SignupDomainService', () => {
  let service: SignupDomainService;
  let persistence: jest.Mocked<SignupDomainPersistence>;

  beforeEach(async () => {
    persistence = { readWhitelist: jest.fn(), updateWhitelist: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SignupDomainService, { provide: SignupDomainPersistence, useValue: persistence }],
    }).compile();

    service = module.get<SignupDomainService>(SignupDomainService);
  });

  it('getWhitelist should return default "*" when missing', async () => {
    persistence.readWhitelist.mockResolvedValue(null);
    const result = await service.getWhitelist();
    expect(result).toEqual(['*']);
  });

  it('getWhitelist should parse and normalize domains', async () => {
    persistence.readWhitelist.mockResolvedValue(' Example.COM ,allowed.org,  ,Another.Net ');
    const result = await service.getWhitelist();
    expect(result).toEqual(['example.com', 'allowed.org', 'another.net']);
  });

  it('setWhitelist should update repository with joined list', async () => {
    await service.setWhitelist(['example.com', 'allowed.org']);
    expect(persistence.updateWhitelist).toHaveBeenCalledWith('example.com,allowed.org');
  });

  it('isLocalSignupEnabled should return false when list is empty', async () => {
    persistence.readWhitelist.mockResolvedValue('');
    const result = await service.isLocalSignupEnabled();
    expect(result).toBe(false);
  });

  it('isLocalSignupEnabled should return true when list has any value', async () => {
    persistence.readWhitelist.mockResolvedValue('*');
    const result = await service.isLocalSignupEnabled();
    expect(result).toBe(true);
  });
});
