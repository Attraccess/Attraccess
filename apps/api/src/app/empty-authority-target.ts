import { NotFoundException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// `scheme://` with an empty host, optionally with userinfo and a port (`http://u@:80/`), followed by
// the path, query, fragment or the end of the target.
const EMPTY_AUTHORITY_TARGET = /^[a-z][a-z\d+.-]*:\/\/(?:[^/?#]*@)?(?::[^/?#]*)?(?=[/?#]|$)/i;

/**
 * Answers absolute-form request targets without a host (`GET HTTP:///cdn/`, `GET http://:80/cdn/`)
 * with the router's 404. Express still routes them by path, but once a static mount strips its
 * prefix the remaining `http:///` has no pathname, and `send` fails on it with a 500.
 */
export function rejectEmptyAuthorityTargets(req: Request, _res: Response, next: NextFunction): void {
  if (!EMPTY_AUTHORITY_TARGET.test(req.url)) {
    next();
    return;
  }
  next(new NotFoundException(`Cannot ${req.method} ${req.originalUrl}`));
}
