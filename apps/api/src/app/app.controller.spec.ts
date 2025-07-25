import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
  });

  describe('/info', () => {
    it('should return api information', () => {
      const appController = app.get<AppController>(AppController);
      expect(appController.getInfo()).toEqual({ name: 'Attraccess API', status: 'ok' });
    });
  });
});
