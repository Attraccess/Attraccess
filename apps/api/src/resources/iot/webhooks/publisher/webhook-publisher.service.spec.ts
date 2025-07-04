import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { WebhookPublisherService } from './webhook-publisher.service';
import { WebhookConfig, Resource, User } from '@attraccess/database-entities';
import { IotService } from '../../iot.service';
import {
  ResourceUsageStartedEvent,
  ResourceUsageEndedEvent,
  ResourceUsageTakenOverEvent,
} from '../../../../resources/usage/events/resource-usage.events';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe('WebhookPublisherService', () => {
  let service: WebhookPublisherService;
  let webhookConfigRepository: jest.Mocked<Repository<WebhookConfig>>;
  let resourceRepository: jest.Mocked<Repository<Resource>>;
  let iotService: jest.Mocked<IotService>;

  // Test data
  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    externalIdentifier: null,
    isEmailVerified: true,
    emailVerificationToken: null,
    emailVerificationTokenExpiresAt: null,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null,
    systemPermissions: {
      canManageResources: false,
      canManageSystemConfiguration: false,
      canManageUsers: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceIntroductions: [],
    resourceUsages: [],
    authenticationDetails: [],
    resourceIntroducerPermissions: [],
  };

  const mockPreviousUser: User = {
    id: 2,
    username: 'previoususer',
    email: 'previous@example.com',
    externalIdentifier: null,
    isEmailVerified: true,
    emailVerificationToken: null,
    emailVerificationTokenExpiresAt: null,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null,
    systemPermissions: {
      canManageResources: false,
      canManageSystemConfiguration: false,
      canManageUsers: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceIntroductions: [],
    resourceUsages: [],
    authenticationDetails: [],
    resourceIntroducerPermissions: [],
  };

  const mockResource: Resource = {
    id: 1,
    name: 'Test Resource',
    description: 'A test resource',
    imageFilename: null,
    documentationType: null,
    documentationMarkdown: null,
    documentationUrl: null,
    allowTakeOver: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    introductions: [],
    usages: [],
    introducers: [],
    mqttConfigs: [],
    webhookConfigs: [],
    groups: [],
    flowNodes: [],
    flowEdges: [],
  };

  const createMockWebhookConfig = (overrides: Partial<WebhookConfig> = {}): WebhookConfig => ({
    id: 1,
    resourceId: 1,
    name: 'Test Webhook',
    url: 'https://example.com/webhook',
    method: 'POST',
    headers: '{"Content-Type": "application/json"}',
    inUseTemplate: '{"status": "in_use", "resource": "{{name}}", "user": "{{user.username}}"}',
    notInUseTemplate: '{"status": "not_in_use", "resource": "{{name}}", "user": "{{user.username}}"}',
    takeoverTemplate:
      '{"status": "taken_over", "resource": "{{name}}", "newUser": "{{user.username}}", "previousUser": "{{previousUser.username}}"}',
    active: true,
    retryEnabled: false,
    maxRetries: 3,
    retryDelay: 1000,
    secret: null,
    signatureHeader: 'X-Webhook-Signature',
    onTakeoverSendStart: false,
    onTakeoverSendStop: false,
    onTakeoverSendTakeover: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    resource: mockResource,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookPublisherService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(5000),
          },
        },
        {
          provide: getRepositoryToken(WebhookConfig),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Resource),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: IotService,
          useValue: {
            processTemplate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookPublisherService>(WebhookPublisherService);
    webhookConfigRepository = module.get(getRepositoryToken(WebhookConfig));
    resourceRepository = module.get(getRepositoryToken(Resource));
    iotService = module.get(IotService);

    // Clear all mocks
    jest.clearAllMocks();
    mockedAxios.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('handleResourceUsageStarted', () => {
    it('should send start message when resource usage starts', async () => {
      const webhook = createMockWebhookConfig();
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue(
        '{"status": "in_use", "resource": "Test Resource", "user": "testuser"}'
      );
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageStarted(event);

      expect(webhookConfigRepository.find).toHaveBeenCalledWith({
        where: { resourceId: 1, active: true },
      });
      expect(iotService.processTemplate).toHaveBeenCalledWith(
        webhook.inUseTemplate,
        expect.objectContaining({
          id: 1,
          name: 'Test Resource',
          user: { id: 1, username: 'testuser', externalIdentifier: null },
        })
      );
    });

    it('should not send webhooks for inactive configurations', async () => {
      const webhook = createMockWebhookConfig({ active: false });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);

      await service.handleResourceUsageStarted(event);

      expect(webhookConfigRepository.find).toHaveBeenCalledWith({
        where: { resourceId: 1, active: true },
      });
      expect(iotService.processTemplate).not.toHaveBeenCalled();
    });
  });

  describe('handleResourceUsageEnded', () => {
    it('should send stop message when resource usage ends', async () => {
      const webhook = createMockWebhookConfig();
      const startTime = new Date();
      const endTime = new Date();
      const event = new ResourceUsageEndedEvent(1, startTime, endTime, mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue(
        '{"status": "not_in_use", "resource": "Test Resource", "user": "testuser"}'
      );
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageEnded(event);

      expect(webhookConfigRepository.find).toHaveBeenCalledWith({
        where: { resourceId: 1, active: true },
      });
      expect(iotService.processTemplate).toHaveBeenCalledWith(
        webhook.notInUseTemplate,
        expect.objectContaining({
          id: 1,
          name: 'Test Resource',
          user: { id: 1, username: 'testuser', externalIdentifier: null },
        })
      );
    });
  });

  describe('handleResourceUsageTakenOver', () => {
    it('should send all three messages when all takeover options are enabled', async () => {
      const webhook = createMockWebhookConfig({
        onTakeoverSendStart: true,
        onTakeoverSendStop: true,
        onTakeoverSendTakeover: true,
      });
      const event = new ResourceUsageTakenOverEvent(1, new Date(), mockUser, mockPreviousUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate
        .mockReturnValueOnce('{"status": "not_in_use", "resource": "Test Resource", "user": "previoususer"}') // stop message
        .mockReturnValueOnce(
          '{"status": "taken_over", "resource": "Test Resource", "newUser": "testuser", "previousUser": "previoususer"}'
        ) // takeover message
        .mockReturnValueOnce('{"status": "in_use", "resource": "Test Resource", "user": "testuser"}'); // start message
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageTakenOver(event);

      expect(iotService.processTemplate).toHaveBeenCalledTimes(3);
      expect(iotService.processTemplate).toHaveBeenNthCalledWith(
        1,
        webhook.notInUseTemplate,
        expect.objectContaining({
          user: { id: 2, username: 'previoususer', externalIdentifier: null },
        })
      );
      expect(iotService.processTemplate).toHaveBeenNthCalledWith(
        2,
        webhook.takeoverTemplate,
        expect.objectContaining({
          user: { id: 1, username: 'testuser', externalIdentifier: null },
          previousUser: { id: 2, username: 'previoususer', externalIdentifier: null },
        })
      );
      expect(iotService.processTemplate).toHaveBeenNthCalledWith(
        3,
        webhook.inUseTemplate,
        expect.objectContaining({
          user: { id: 1, username: 'testuser', externalIdentifier: null },
        })
      );
    });

    it('should only send takeover message when only onTakeoverSendTakeover is enabled', async () => {
      const webhook = createMockWebhookConfig({
        onTakeoverSendStart: false,
        onTakeoverSendStop: false,
        onTakeoverSendTakeover: true,
      });
      const event = new ResourceUsageTakenOverEvent(1, new Date(), mockUser, mockPreviousUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue(
        '{"status": "taken_over", "resource": "Test Resource", "newUser": "testuser", "previousUser": "previoususer"}'
      );
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageTakenOver(event);

      expect(iotService.processTemplate).toHaveBeenCalledTimes(1);
      expect(iotService.processTemplate).toHaveBeenCalledWith(
        webhook.takeoverTemplate,
        expect.objectContaining({
          user: { id: 1, username: 'testuser', externalIdentifier: null },
          previousUser: { id: 2, username: 'previoususer', externalIdentifier: null },
        })
      );
    });

    it('should only send stop message when only onTakeoverSendStop is enabled', async () => {
      const webhook = createMockWebhookConfig({
        onTakeoverSendStart: false,
        onTakeoverSendStop: true,
        onTakeoverSendTakeover: false,
      });
      const event = new ResourceUsageTakenOverEvent(1, new Date(), mockUser, mockPreviousUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue(
        '{"status": "not_in_use", "resource": "Test Resource", "user": "previoususer"}'
      );
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageTakenOver(event);

      expect(iotService.processTemplate).toHaveBeenCalledTimes(1);
      expect(iotService.processTemplate).toHaveBeenCalledWith(
        webhook.notInUseTemplate,
        expect.objectContaining({
          user: { id: 2, username: 'previoususer', externalIdentifier: null },
        })
      );
    });

    it('should only send start message when only onTakeoverSendStart is enabled', async () => {
      const webhook = createMockWebhookConfig({
        onTakeoverSendStart: true,
        onTakeoverSendStop: false,
        onTakeoverSendTakeover: false,
      });
      const event = new ResourceUsageTakenOverEvent(1, new Date(), mockUser, mockPreviousUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue(
        '{"status": "in_use", "resource": "Test Resource", "user": "testuser"}'
      );
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageTakenOver(event);

      expect(iotService.processTemplate).toHaveBeenCalledTimes(1);
      expect(iotService.processTemplate).toHaveBeenCalledWith(
        webhook.inUseTemplate,
        expect.objectContaining({
          user: { id: 1, username: 'testuser', externalIdentifier: null },
        })
      );
    });

    it('should not send any messages when all takeover options are disabled', async () => {
      const webhook = createMockWebhookConfig({
        onTakeoverSendStart: false,
        onTakeoverSendStop: false,
        onTakeoverSendTakeover: false,
      });
      const event = new ResourceUsageTakenOverEvent(1, new Date(), mockUser, mockPreviousUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);

      await service.handleResourceUsageTakenOver(event);

      expect(iotService.processTemplate).not.toHaveBeenCalled();
      expect(mockedAxios).not.toHaveBeenCalled();
    });

    it('should skip takeover message when takeoverTemplate is null', async () => {
      const webhook = createMockWebhookConfig({
        onTakeoverSendStart: false,
        onTakeoverSendStop: false,
        onTakeoverSendTakeover: true,
        takeoverTemplate: null,
      });
      const event = new ResourceUsageTakenOverEvent(1, new Date(), mockUser, mockPreviousUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);

      await service.handleResourceUsageTakenOver(event);

      expect(iotService.processTemplate).not.toHaveBeenCalled();
      expect(mockedAxios).not.toHaveBeenCalled();
    });
  });

  describe('URL and Header Template Processing', () => {
    it('should process URL templates with handlebars', async () => {
      const webhook = createMockWebhookConfig({
        url: 'https://example.com/webhook/{{id}}/{{name}}',
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate
        .mockReturnValueOnce('{"status": "in_use"}') // payload template
        .mockReturnValueOnce('https://example.com/webhook/1/Test Resource'); // URL template
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageStarted(event);

      expect(iotService.processTemplate).toHaveBeenCalledWith(
        'https://example.com/webhook/{{id}}/{{name}}',
        expect.objectContaining({
          id: 1,
          name: 'Test Resource',
        })
      );
    });

    it('should process header templates with handlebars', async () => {
      const webhook = createMockWebhookConfig({
        headers: '{"X-Resource-Name": "{{name}}", "X-User": "{{user.username}}"}',
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate
        .mockReturnValueOnce('{"status": "in_use"}') // payload template
        .mockReturnValueOnce('Test Resource') // header template for X-Resource-Name
        .mockReturnValueOnce('testuser'); // header template for X-User
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageStarted(event);

      expect(iotService.processTemplate).toHaveBeenCalledWith(
        '{{name}}',
        expect.objectContaining({
          id: 1,
          name: 'Test Resource',
        })
      );
      expect(iotService.processTemplate).toHaveBeenCalledWith(
        '{{user.username}}',
        expect.objectContaining({
          user: { id: 1, username: 'testuser', externalIdentifier: null },
        })
      );
    });

    it('should not process URLs without handlebars templates', async () => {
      const webhook = createMockWebhookConfig({
        url: 'https://example.com/webhook',
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValueOnce('{"status": "in_use"}'); // only payload template
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageStarted(event);

      // Should only be called once for the payload template, not for URL
      expect(iotService.processTemplate).toHaveBeenCalledTimes(1);
      expect(iotService.processTemplate).toHaveBeenCalledWith(webhook.inUseTemplate, expect.anything());
    });
  });

  describe('Webhook Security and Signatures', () => {
    it('should add signature header when secret is provided', async () => {
      const webhook = createMockWebhookConfig({
        secret: 'test-secret',
        signatureHeader: 'X-Custom-Signature',
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "in_use"}');
      mockedAxios.mockResolvedValue({ status: 200 });

      // Mock Date.now to get predictable timestamp
      const mockTimestamp = 1234567890;
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

      await service.handleResourceUsageStarted(event);

      // Wait for queue processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Timestamp': mockTimestamp.toString(),
            'X-Custom-Signature': expect.any(String),
          }),
        })
      );
    });

    it('should not add signature header when secret is null', async () => {
      const webhook = createMockWebhookConfig({
        secret: null,
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "in_use"}');
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageStarted(event);

      // Wait for queue processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'X-Webhook-Signature': expect.any(String),
          }),
        })
      );
    });
  });

  describe('Retry Mechanism', () => {
    it('should retry failed webhooks when retry is enabled', async () => {
      const webhook = createMockWebhookConfig({
        retryEnabled: true,
        maxRetries: 2,
        retryDelay: 0, // Use 0 delay for immediate retry in tests
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "in_use"}');

      // First call fails, subsequent calls succeed
      mockedAxios.mockRejectedValueOnce(new Error('Network error')).mockResolvedValue({ status: 200 });

      await service.handleResourceUsageStarted(event);

      // Manually process queue for retries
      await service.processQueueManually();

      expect(mockedAxios).toHaveBeenCalledTimes(2);
    });

    it('should not retry when retry is disabled', async () => {
      const webhook = createMockWebhookConfig({
        retryEnabled: false,
        maxRetries: 2,
        retryDelay: 0,
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "in_use"}');
      mockedAxios.mockRejectedValue(new Error('Network error'));

      await service.handleResourceUsageStarted(event);

      // Manual queue processing shouldn't retry since retryEnabled is false
      await service.processQueueManually();

      expect(mockedAxios).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying after max retries reached', async () => {
      const webhook = createMockWebhookConfig({
        retryEnabled: true,
        maxRetries: 2,
        retryDelay: 0, // Use 0 delay for immediate retry in tests
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "in_use"}');
      mockedAxios.mockRejectedValue(new Error('Network error'));

      await service.handleResourceUsageStarted(event);

      // Process queue multiple times to trigger all retries
      await service.processQueueManually();
      await service.processQueueManually();

      // Should be called 3 times total (initial + 2 retries)
      expect(mockedAxios).toHaveBeenCalledTimes(3);
    });
  });

  describe('testWebhook', () => {
    it('should successfully test a webhook', async () => {
      const webhook = createMockWebhookConfig();

      webhookConfigRepository.findOne.mockResolvedValue(webhook);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "test"}');
      mockedAxios.mockResolvedValue({ status: 200 });

      const result = await service.testWebhook(1, 1);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Webhook test request sent successfully');
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://example.com/webhook',
          data: '{"status": "test"}',
        })
      );
    });

    it('should return error when webhook not found', async () => {
      webhookConfigRepository.findOne.mockResolvedValue(null);

      const result = await service.testWebhook(999, 1);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Webhook configuration with ID 999 not found');
    });

    it('should return error when resource not found', async () => {
      const webhook = createMockWebhookConfig();

      webhookConfigRepository.findOne.mockResolvedValue(webhook);
      resourceRepository.findOne.mockResolvedValue(null);

      const result = await service.testWebhook(1, 999);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Resource with ID 999 not found');
    });

    it('should return error when headers JSON is invalid', async () => {
      const webhook = createMockWebhookConfig({
        headers: 'invalid json',
      });

      webhookConfigRepository.findOne.mockResolvedValue(webhook);
      resourceRepository.findOne.mockResolvedValue(mockResource);

      const result = await service.testWebhook(1, 1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid headers JSON');
    });

    it('should handle axios errors in test webhook', async () => {
      const webhook = createMockWebhookConfig();

      webhookConfigRepository.findOne.mockResolvedValue(webhook);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "test"}');
      mockedAxios.mockRejectedValue({
        response: {
          status: 404,
          data: { error: 'Not found' },
        },
      });

      const result = await service.testWebhook(1, 1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Server responded with 404');
    });
  });

  describe('HTTP Methods', () => {
    it('should handle GET requests without data', async () => {
      const webhook = createMockWebhookConfig({
        method: 'GET',
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "in_use"}');
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageStarted(event);

      // Wait for queue processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: expect.any(String),
          headers: expect.any(Object),
          timeout: expect.any(Number),
        })
      );

      // Verify that no data field was included for GET request
      const lastCall = mockedAxios.mock.calls[mockedAxios.mock.calls.length - 1][0];
      expect(lastCall).not.toHaveProperty('data');
    });

    it('should handle POST requests with data', async () => {
      const webhook = createMockWebhookConfig({
        method: 'POST',
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "in_use"}');
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageStarted(event);

      // Wait for queue processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: '{"status": "in_use"}',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid headers JSON gracefully', async () => {
      const webhook = createMockWebhookConfig({
        headers: 'invalid json',
      });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "in_use"}');

      // Should not throw an error
      await expect(service.handleResourceUsageStarted(event)).resolves.not.toThrow();
    });

    it('should handle template processing errors gracefully', async () => {
      const webhook = createMockWebhookConfig();
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockImplementation(() => {
        throw new Error('Template error');
      });

      // Should not throw an error
      await expect(service.handleResourceUsageStarted(event)).resolves.not.toThrow();
    });

    it('should handle missing resource gracefully', async () => {
      const webhook = createMockWebhookConfig();
      const event = new ResourceUsageStartedEvent(999, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook]);
      resourceRepository.findOne.mockResolvedValue(null);

      // Should not throw an error
      await expect(service.handleResourceUsageStarted(event)).resolves.not.toThrow();
    });
  });

  describe('Multiple Webhooks', () => {
    it('should process multiple webhooks for the same resource', async () => {
      const webhook1 = createMockWebhookConfig({ id: 1, name: 'Webhook 1' });
      const webhook2 = createMockWebhookConfig({ id: 2, name: 'Webhook 2' });
      const event = new ResourceUsageStartedEvent(1, new Date(), mockUser);

      webhookConfigRepository.find.mockResolvedValue([webhook1, webhook2]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "in_use"}');
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageStarted(event);

      // Wait for queue processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockedAxios).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed takeover configurations for multiple webhooks', async () => {
      const webhook1 = createMockWebhookConfig({
        id: 1,
        onTakeoverSendStart: true,
        onTakeoverSendStop: false,
        onTakeoverSendTakeover: false,
      });
      const webhook2 = createMockWebhookConfig({
        id: 2,
        onTakeoverSendStart: false,
        onTakeoverSendStop: true,
        onTakeoverSendTakeover: true,
      });
      const event = new ResourceUsageTakenOverEvent(1, new Date(), mockUser, mockPreviousUser);

      webhookConfigRepository.find.mockResolvedValue([webhook1, webhook2]);
      resourceRepository.findOne.mockResolvedValue(mockResource);
      iotService.processTemplate.mockReturnValue('{"status": "test"}');
      mockedAxios.mockResolvedValue({ status: 200 });

      await service.handleResourceUsageTakenOver(event);

      // webhook1 should send 1 message (start), webhook2 should send 2 messages (stop + takeover)
      expect(iotService.processTemplate).toHaveBeenCalledTimes(3);
    });
  });
});
