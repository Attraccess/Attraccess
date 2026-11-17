import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileStorageService } from './file-storage.service';
import { FileUploadValidationError } from '../errors/file-upload-validation.error';
import { AllowedMimeType } from '../../config/storage.config';
import { FileUpload } from '../types/file-upload.types';

jest.mock('fs/promises');
jest.mock('path');
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('mockedrandomstring'),
  }),
}));

describe('FileStorageService', () => {
  let service: FileStorageService;
  let configService: jest.Mocked<ConfigService>;

  const mockStorageConfig = {
    cdn: {
      root: '/fake/storage/path',
      serveRoot: '/cdn',
    },
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'] as AllowedMimeType[],
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key) => {
      if (key === 'storage') return mockStorageConfig;
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock path.join to return predictable paths
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    // containment checks need real resolution of `..` segments
    (path.resolve as jest.Mock).mockImplementation(jest.requireActual('path').posix.resolve);
    // Mock path.extname to return the file extension
    (path.extname as jest.Mock).mockImplementation((filename) => {
      const parts = filename.split('.');
      return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    });

    // Mock Date.now() to return a fixed timestamp
    jest.spyOn(Date, 'now').mockReturnValue(1234567890);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileStorageService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<FileStorageService>(FileStorageService);
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw error if storage config is not found', async () => {
    configService.get.mockReturnValueOnce(undefined);

    expect(() => {
      new FileStorageService(configService);
    }).toThrow("Storage configuration ('storage') not found. Check ConfigModule setup.");
  });

  describe('onModuleInit', () => {
    it('should create storage directory if it does not exist', async () => {
      (fs.access as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));

      await service.onModuleInit();

      expect(fs.access).toHaveBeenCalledWith(mockStorageConfig.cdn.root);
      expect(fs.mkdir).toHaveBeenCalledWith(mockStorageConfig.cdn.root, {
        recursive: true,
        mode: 0o755,
      });
    });

    it('should not create storage directory if it already exists', async () => {
      (fs.access as jest.Mock).mockResolvedValueOnce(undefined);

      await service.onModuleInit();

      expect(fs.access).toHaveBeenCalledWith(mockStorageConfig.cdn.root);
      expect(fs.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('saveFile', () => {
    const mockFile: FileUpload = {
      fieldname: 'image',
      originalname: 'test-image.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('fake image data'),
      size: 1024,
    };

    it('should save a valid file and return the new filename', async () => {
      const subDirectory = 'resources/123';
      const expectedFilename = '1234567890_mockedrandomstring.jpg';
      const expectedFilePath = `/fake/storage/path/${subDirectory}/${expectedFilename}`;

      const result = await service.saveFile(mockFile, subDirectory);

      expect(fs.mkdir).toHaveBeenCalledWith(`/fake/storage/path/${subDirectory}`, {
        recursive: true,
        mode: 0o755,
      });
      expect(fs.writeFile).toHaveBeenCalledWith(expectedFilePath, mockFile.buffer, { mode: 0o644 });
      expect(result).toBe(expectedFilename);
    });

    it('should throw error when file exceeds max size', async () => {
      const largeFile: FileUpload = {
        ...mockFile,
        size: mockStorageConfig.maxFileSize + 1,
      };

      await expect(service.saveFile(largeFile, 'resources/123')).rejects.toThrow(FileUploadValidationError);
    });

    it('should throw error when file type is not allowed', async () => {
      const invalidFile: FileUpload = {
        ...mockFile,
        mimetype: 'application/pdf',
      };

      await expect(service.saveFile(invalidFile, 'resources/123')).rejects.toThrow(FileUploadValidationError);
    });
  });

  describe('deleteFile', () => {
    it('should delete an existing file', async () => {
      const subDirectory = 'resources/123';
      const filename = 'image.jpg';
      const filePath = `/fake/storage/path/${subDirectory}/${filename}`;

      await service.deleteFile(subDirectory, filename);

      expect(fs.unlink).toHaveBeenCalledWith(filePath);
    });

    it('should not throw error if file does not exist', async () => {
      const error = new Error('ENOENT');
      (error as unknown as { code: string }).code = 'ENOENT';
      (fs.unlink as jest.Mock).mockRejectedValueOnce(error);

      await expect(service.deleteFile('resources/123', 'nonexistent.jpg')).resolves.not.toThrow();
    });

    it('should throw error for other unlink errors', async () => {
      const error = new Error('Some other error');
      (fs.unlink as jest.Mock).mockRejectedValueOnce(error);

      await expect(service.deleteFile('resources/123', 'image.jpg')).rejects.toThrow('Some other error');
    });
  });

  describe('getFilePath', () => {
    it('should return the file path if file exists', async () => {
      const subDirectory = 'resources/123';
      const filename = 'image.jpg';
      const expectedPath = `/fake/storage/path/${subDirectory}/${filename}`;

      (fs.access as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await service.getFilePath(subDirectory, filename);

      expect(fs.access).toHaveBeenCalledWith(expectedPath);
      expect(result).toBe(expectedPath);
    });

    it('should throw FileNotFoundError if file does not exist', async () => {
      (fs.access as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));

      await expect(service.getFilePath('resources/123', 'nonexistent.jpg')).rejects.toThrow('FileNotFoundError');
    });
  });

  describe('containment', () => {
    it.each([
      ['a parent filename', 'resources/123', '../../../attraccess.sqlite'],
      ['an absolute filename', 'resources/123', '/etc/passwd'],
      ['a parent subdirectory', '../outside', 'image.jpg'],
      ['the storage root itself', '.', '.'],
      ['a sibling sharing the root as a prefix', '../path-evil', 'image.jpg'],
    ])('refuses %s', async (_label, subDirectory, filename) => {
      await expect(service.getFilePath(subDirectory, filename)).rejects.toThrow('FileNotFoundError');
      await expect(service.deleteFile(subDirectory, filename)).rejects.toThrow('FileNotFoundError');
      expect(fs.access).not.toHaveBeenCalled();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('refuses to save into a subdirectory outside the storage root', async () => {
      const file = { originalname: 'a.jpg', mimetype: 'image/jpeg', size: 1, buffer: Buffer.from('x') } as FileUpload;

      await expect(service.saveFile(file, '../../outside')).rejects.toThrow('FileNotFoundError');
      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('getPublicPath', () => {
    it('should return the public URL for a file', () => {
      const subDirectory = 'resources/123';
      const filename = 'image.jpg';
      const expectedUrl = '/cdn/resources/123/image.jpg';

      const result = service.getPublicPath(subDirectory, filename);

      expect(result).toBe(expectedUrl);
    });
  });
});
