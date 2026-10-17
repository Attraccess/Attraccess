/**
 * Route-shadow guard (ATT-534)
 *
 * In NestJS/Express, routes are matched in registration order — first registered
 * wins.  A :param segment matches ANY single segment, including static strings.
 * So if GET /users/:id is registered before GET /users/with-permission, Express
 * will route GET /users/with-permission to the :id handler and the static route
 * becomes unreachable.
 *
 * This spec performs static source analysis to assert that no :param route is
 * registered before a static route of the same HTTP method and the same URL
 * depth (segment count) when both controllers share the same @Controller(prefix).
 *
 * It checks two scenarios:
 *  1. Within a single controller file (intra-file order by line number).
 *  2. Across controllers in the same module (inter-file order by controllers[]
 *     array position).
 */

import { parseControllers } from './route-shadow.controllers.test-fixture';
import {
  detectShadowsInModule,
  detectShadowsWithinController,
  parseControllersArray,
  parseImports,
} from './route-shadow.modules.test-fixture';
import {
  ControllerInfo,
  HTTP_METHODS,
  isParam,
  normalisePath,
  pathSegments,
  shadows,
  walkDir,
} from './route-shadow.paths.test-fixture';

const API_SRC = __dirname;

// ─── Types ───────────────────────────────────────────────────────────────────
// ─── File discovery ───────────────────────────────────────────────────────────
// ─── Controller parsing ───────────────────────────────────────────────────────
// ─── Module parsing ───────────────────────────────────────────────────────────
// ─── Shadow detection ─────────────────────────────────────────────────────────

export function registerRouteShadowGuardAtt534Fixture() {
  let controllerMap: Map<string, ControllerInfo>;

  let moduleFiles: string[];

  beforeAll(() => {
    const controllerFiles = walkDir(API_SRC, '.controller.ts').filter(
      (f) => !f.endsWith('.spec.ts') && !f.endsWith('.e2e.spec.ts'),
    );
    moduleFiles = walkDir(API_SRC, '.module.ts').filter((f) => !f.endsWith('.spec.ts'));

    controllerMap = new Map();
    for (const file of controllerFiles) {
      for (const info of parseControllers(file)) controllerMap.set(info.className, info);
    }
  });
  return {
    get API_SRC() {
      return API_SRC;
    },
    get walkDir() {
      return walkDir;
    },
    get HTTP_METHODS() {
      return HTTP_METHODS;
    },
    get normalisePath() {
      return normalisePath;
    },
    get pathSegments() {
      return pathSegments;
    },
    get isParam() {
      return isParam;
    },
    get shadows() {
      return shadows;
    },
    get parseControllers() {
      return parseControllers;
    },
    get parseImports() {
      return parseImports;
    },
    get parseControllersArray() {
      return parseControllersArray;
    },
    get detectShadowsInModule() {
      return detectShadowsInModule;
    },
    get detectShadowsWithinController() {
      return detectShadowsWithinController;
    },
    get controllerMap() {
      return controllerMap;
    },
    get moduleFiles() {
      return moduleFiles;
    },
    set controllerMap(value: typeof controllerMap) {
      controllerMap = value;
    },
    set moduleFiles(value: typeof moduleFiles) {
      moduleFiles = value;
    },
  };
}
