import { Controller, Get, Param, ParseIntPipe, Req, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { UseGuards, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import {
  PLUGIN_RESOURCE_VISIBILITY_HOST,
  ResourceNotFoundException,
  ResourceVisible,
} from './plugin-resource-visibility';

const VISIBLE = 1;
const HIDDEN = 2;
const handled = jest.fn();

/** Signs in the user named in the header; without one the request stays anonymous (and passes this guard). */
class HeaderUser implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (request.headers['x-user']) request.user = { id: 10, effectivePermissions: new Set(['resources.read']) };
    return true;
  }
}

@UseGuards(HeaderUser)
@Controller('plugin')
class MachineController {
  @Get('resources/:resourceId/thing')
  @ResourceVisible()
  byResourceId(@Param('resourceId', ParseIntPipe) resourceId: number) {
    handled(resourceId);
    return { resourceId };
  }

  @Get('resources/:id/diagnostics')
  @ResourceVisible('id')
  byId(@Param('id', ParseIntPipe) id: number) {
    handled(id);
    return { id };
  }

  @Get('things/:id')
  undecorated(@Param('id') id: string, @Req() _request: unknown) {
    return { id };
  }
}

@UseGuards(HeaderUser)
@ResourceVisible()
@Controller('plugin-class/resources/:resourceId')
class WholeController {
  @Get()
  get(@Param('resourceId', ParseIntPipe) resourceId: number) {
    return { resourceId };
  }
}

describe('ResourceVisible', () => {
  let app: INestApplication;
  const canSee = jest.fn(async (_principal: unknown, resourceId: number) => resourceId === VISIBLE);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MachineController, WholeController],
      providers: [{ provide: PLUGIN_RESOURCE_VISIBILITY_HOST, useValue: { canSee } }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const get = (path: string, signedIn = true) => {
    const call = supertest(app.getHttpServer()).get(path);
    return signedIn ? call.set('x-user', '1') : call;
  };

  const ROUTES = [
    (id: number | string) => `/plugin/resources/${id}/thing`,
    (id: number | string) => `/plugin/resources/${id}/diagnostics`,
    (id: number | string) => `/plugin-class/resources/${id}`,
  ];

  it.each(ROUTES)('answers core’s 404 for a hidden machine, before the handler (%#)', async (route) => {
    const response = await get(route(HIDDEN));
    expect(response.status).toBe(404);
    expect(response.body).toEqual(new ResourceNotFoundException(HIDDEN).getResponse());
    expect(response.body).toEqual({
      statusCode: 404,
      message: 'ResourceNotFoundException',
      error: `Resource with ID ${HIDDEN} not found`,
    });
    expect(handled).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('passes a visible machine on, asking about the request user (%#)', async (route) => {
    expect((await get(route(VISIBLE))).status).toBe(200);
    expect(canSee).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }), VISIBLE);
  });

  it.each(['abc', '-1', '1.5', '0x2'])('leaves the id "%s" to the route’s pipe', async (id) => {
    const response = await get(`/plugin/resources/${id}/thing`);
    expect(response.status).not.toBe(404);
    expect(canSee).not.toHaveBeenCalled();
  });

  it('passes a request without a user on: signing in is the route’s own job', async () => {
    expect((await get(`/plugin/resources/${HIDDEN}/thing`, false)).status).toBe(200);
    expect(canSee).not.toHaveBeenCalled();
  });

  it('fails to start without the host, instead of leaving the route unchecked', async () => {
    await expect(Test.createTestingModule({ controllers: [MachineController] }).compile()).rejects.toThrow(
      /PluginResourceVisibleInterceptor/,
    );
  });
});
