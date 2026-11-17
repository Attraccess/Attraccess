import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isAcceptedRequestTarget, rejectInvalidRequestTarget } from './request-target';

describe('isAcceptedRequestTarget', () => {
  it.each([
    '/',
    '/cdn/resources/1/image.png?x=1',
    '//cdn/',
    '*',
    'http://localhost/cdn/missing.png',
    'HTTPS://example.com:8443/api/health',
    'http://user:pass@example.com/cdn/',
    'http://[::1]:3000/cdn/',
    'http://localhost?q=/cdn/',
  ])('accepts %s', (target) => {
    expect(isAcceptedRequestTarget(target)).toBe(true);
  });

  it.each([
    'http:///cdn/',
    'HTTP:///cdn/missing.png',
    'http://',
    'http://:80/cdn/',
    'http://@/cdn/',
    'http://localhost:x/cdn/',
    'ftp://localhost/cdn/',
    'file:///cdn/',
    'localhost:443',
    'cdn/',
    '',
  ])('rejects %s', (target) => {
    expect(isAcceptedRequestTarget(target)).toBe(false);
  });
});

describe('rejectInvalidRequestTarget', () => {
  const res = {} as Response;

  it('passes accepted targets on', () => {
    const next = jest.fn();

    rejectInvalidRequestTarget({ url: '/cdn/' } as Request, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('hands invalid targets a 400', () => {
    const next = jest.fn();

    rejectInvalidRequestTarget({ url: 'http:///cdn/' } as Request, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestException));
    expect(next.mock.calls[0][0].getStatus()).toBe(400);
  });
});
