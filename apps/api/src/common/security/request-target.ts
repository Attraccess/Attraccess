import { BadRequestException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { parse } from 'node:url';

const HTTP_ABSOLUTE_FORM = /^https?:\/\//i;

/**
 * Whether a request target is one this server accepts: origin-form (`/path`), asterisk-form (`*`), or an
 * absolute-form `http(s)` URI with a host. RFC 9110 (4.2.1, 4.2.2) makes an http(s) URI with an empty
 * host invalid and tells recipients to reject it.
 *
 * Absolute-form targets are checked with `url.parse`, the parser Express (parseurl) applies to them, so
 * this accepts nothing Express would fail on. Express keeps everything before the first `/` after `://`
 * when it strips a mount prefix, so that part has to parse to a host on its own as well.
 */
export function isAcceptedRequestTarget(target: string): boolean {
  if (target.startsWith('/') || target === '*') return true;
  if (!HTTP_ABSOLUTE_FORM.test(target)) return false;
  const pathStart = target.indexOf('/', target.indexOf('://') + 3);
  const schemeAndAuthority = pathStart === -1 ? target : target.slice(0, pathStart);
  try {
    parse(target);
    return Boolean(parse(schemeAndAuthority).hostname);
  } catch {
    return false;
  }
}

/**
 * Answers invalid request targets with 400 before any route or static mount sees them. Without it, a
 * mount prefix stripped from an absolute-form target without a host leaves a URL with no path
 * (`GET http:///cdn/` reaches the `/cdn` static mount as `http://`), which serve-static answers with a 500.
 */
export function rejectInvalidRequestTarget(req: Request, _res: Response, next: NextFunction): void {
  if (isAcceptedRequestTarget(req.url)) {
    next();
    return;
  }
  next(new BadRequestException('Invalid request target'));
}
