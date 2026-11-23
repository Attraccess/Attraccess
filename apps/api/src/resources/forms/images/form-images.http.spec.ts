import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest, DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import request from 'supertest';
import { FormImageHandoffService } from './form-image-handoff.service';
import { FormImageViewerGuard } from './form-image-viewer.guard';
import { FormImagesController } from './form-images.controller';
import { FormImagesService } from './form-images.service';
import { FormPhotoController } from './form-photo.controller';
import { FormPhotoRateLimitGuard } from './form-photo-rate-limit.guard';
import { FIELD_ID, FORM_ID, RESOURCE_ID, USER_ID, createImageServices, jpegUpload } from './form-images.test-fixture';

const UPLOAD = `/resources/${RESOURCE_ID}/forms/${FORM_ID}/fields/${FIELD_ID}/images?action=start`;
const OTHER_USER = 99;

/** The image routes over HTTP (ATT-879): who sees what, caching, upload refusals and rate limits. */
describe('form image endpoints (HTTP)', () => {
  let app: INestApplication;
  let services: ReturnType<typeof createImageServices>;

  /** Signs in whoever the `x-test-user` header names, with the permissions of `x-test-permissions`. */
  const signIn = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
      if (!req.headers['x-test-user']) throw new UnauthorizedException();
      req.user = {
        id: Number(req.headers['x-test-user']),
        effectivePermissions: new Set(String(req.headers['x-test-permissions'] ?? '').split(',')),
      } as unknown as AuthenticatedRequest['user'];
      return true;
    },
  };

  beforeEach(async () => {
    services = createImageServices();
    const module = await Test.createTestingModule({
      controllers: [FormImagesController, FormPhotoController],
      providers: [
        { provide: FormImagesService, useValue: services.images },
        { provide: FormImageHandoffService, useValue: services.handoffs },
        FormPhotoRateLimitGuard,
        { provide: DualAuthGuard, useValue: signIn },
        FormImageViewerGuard,
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useValue(signIn)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });
  afterEach(async () => app.close());

  const http = () => request(app.getHttpServer());
  const asUser = (test: request.Test, userId: number, permissions = '') =>
    test.set('x-test-user', String(userId)).set('x-test-permissions', permissions);
  let jpeg: Buffer;
  beforeAll(async () => {
    jpeg = (await jpegUpload()).buffer;
  });
  const upload = (userId = USER_ID) => asUser(http().post(UPLOAD), userId).attach('image', jpeg, 'photo.jpg');

  describe('GET /forms/images/:id', () => {
    it('is 404 without a sign-in and for another user, as for an unknown id', async () => {
      const { body } = await upload().expect(201);

      const anonymous = await http().get(`/forms/images/${body.id}`).expect(404);
      const other = await asUser(http().get(`/forms/images/${body.id}`), OTHER_USER).expect(404);
      const unknown = await asUser(http().get('/forms/images/3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01'), USER_ID).expect(
        404,
      );

      expect(anonymous.body).toEqual(unknown.body);
      expect(other.body).toEqual(unknown.body);
      expect(other.headers.etag).not.toBe(`"${body.id}"`);
      expect(other.headers['cache-control']).toBeUndefined();
    });

    it('serves the owner the JPEG for revalidation on every use, and 304 while it is unchanged', async () => {
      const { body } = await upload().expect(201);

      const first = await asUser(http().get(`/forms/images/${body.id}`), USER_ID).expect(200);

      expect(first.headers['content-type']).toBe('image/jpeg');
      expect(first.headers['cache-control']).toBe('private, no-cache');
      expect(first.headers['x-content-type-options']).toBe('nosniff');
      expect(first.headers.etag).toBe(`"${body.id}"`);
      expect(Buffer.isBuffer(first.body) && first.body.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))).toBe(true);

      const again = await asUser(http().get(`/forms/images/${body.id}`), USER_ID)
        .set('If-None-Match', first.headers.etag)
        .expect(304);
      expect(again.headers.etag).toBe(`"${body.id}"`);
      expect(again.headers['cache-control']).toBe('private, no-cache');

      // A cached copy is no use to another user: the access check comes before the 304.
      await asUser(http().get(`/forms/images/${body.id}`), OTHER_USER)
        .set('If-None-Match', first.headers.etag)
        .expect(404);
    });

    it('serves a user who may update resources', async () => {
      const { body } = await upload().expect(201);
      await asUser(http().get(`/forms/images/${body.id}`), OTHER_USER, 'resources.update').expect(200);
    });
  });

  describe('POST upload', () => {
    it('refuses an oversize file, a GIF and extra multipart fields with 400', async () => {
      const oversize = await asUser(http().post(UPLOAD), USER_ID)
        .attach('image', Buffer.alloc(11 * 1024 * 1024, 1), { filename: 'big.jpg', contentType: 'image/jpeg' })
        .expect(400);
      expect(oversize.body.message).toBe('FileUploadValidationError');

      const gif = Buffer.from('R0lGODlhAQABAAAAACwAAAAAAQABAAA=', 'base64');
      await asUser(http().post(UPLOAD), USER_ID)
        .attach('image', gif, { filename: 'photo.gif', contentType: 'image/gif' })
        .expect(400);

      const extra = await asUser(http().post(UPLOAD), USER_ID)
        .field('note', 'x'.repeat(100))
        .attach('image', jpeg, 'photo.jpg')
        .expect(400);
      expect(extra.body.message).toBe('FileUploadValidationError');
      await asUser(http().post(UPLOAD), USER_ID)
        .attach('image', jpeg, 'photo.jpg')
        .attach('second', jpeg, 'photo.jpg')
        .expect(400);

      expect(services.store.images.size).toBe(0);
    });

    it('allows 30 uploads per user in ten minutes, then 429, counting only signed-in requests', async () => {
      await http().post(UPLOAD).expect(401);
      // Requests without a file are refused after the limit counted them, which keeps this test fast.
      for (let i = 0; i < 30; i++) await asUser(http().post(UPLOAD), USER_ID).expect(400);

      const limited = await asUser(http().post(UPLOAD), USER_ID).expect(429);

      expect(limited.headers['retry-after']).toBeDefined();
      await upload(OTHER_USER).expect(201);
    });
  });

  describe('phone routes', () => {
    const token = 'A'.repeat(24);

    it('answers an unknown token with 410', async () => {
      await http().get(`/form-photo/${token}`).expect(410);
      await http().post(`/form-photo/${token}/images`).attach('image', Buffer.from('x'), 'photo.jpg').expect(410);
      await http().delete(`/form-photo/${token}/images/3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01`).expect(410);
    });

    it('allows 30 writes per address in ten minutes, then 429', async () => {
      for (let i = 0; i < 30; i++) await http().post(`/form-photo/${token}/images`).expect(410);

      const limited = await http().post(`/form-photo/${token}/images`).expect(429);

      expect(limited.headers['retry-after']).toBe('600');
      await http().get(`/form-photo/${token}`).expect(410);
    });
  });
});
