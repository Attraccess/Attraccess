import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';

const require = createRequire(import.meta.url);
const rule = require('./no-service-inheritance.cjs');

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parser: require('@typescript-eslint/parser') } });
const abstractClass = [{ messageId: 'abstractClass' }];
const providerInheritance = [{ messageId: 'providerInheritance' }];
const classInheritance = [{ messageId: 'classInheritance' }];

tester.run('no-service-inheritance', rule, {
  valid: [
    '@Injectable()\nexport class A {\n  constructor(private readonly b: B) {}\n}',
    '@Controller("a")\nexport class A {}',
    // Framework mixins and allow-listed framework bases.
    "@Injectable()\nexport class S extends PassportStrategy(Strategy, 'session') {}",
    "@Injectable()\nexport class G extends AuthGuard(['local']) {}",
    '@Injectable()\nexport class L extends SAML {}',
    // Classes that are no providers may extend: errors, DTOs, entities.
    'export class NotFound extends HttpException {}',
    'export class Err extends Error {}',
    'export class MeteringTimeoutError extends MeteringOperationError {}',
    'export class BadRequest extends BadRequestException {}',
    'export class Dto extends PartialType(Other) {}',
    'export class Conn extends EventEmitter {}',
    'export class Log extends ConsoleLogger {}',
    '@Catch()\nexport class F extends BaseExceptionFilter {}',
    'export class Perms extends Set<string> {}',
    '@Injectable()\nexport class E extends Error {}',
    { code: 'export class Page extends PaginatedResponse<User> {}', filename: 'src/users/dtos/page.dto.ts' },
    { code: 'export class A extends B {}', filename: 'src/x/dto/a.ts' },
    { code: 'export class A extends B {}', filename: 'src/x/dtos/a.ts' },
    { code: 'export class A extends B {}', filename: 'src/x/a.dto.ts' },
    { code: 'export class A extends B {}', filename: 'src\\x\\dto\\a.ts' },
    '// inheritance: data shape\nexport class A extends B {}',
    // Justified exceptions.
    '// inheritance: DI token that the sync service implements\nexport abstract class Sync {\n  abstract run(): void;\n}',
    '/**\n * The contract.\n * inheritance: DI token only, never extended\n */\nexport abstract class Sync {}',
    '// inheritance: framework base without a mixin\n@Injectable()\nexport class A extends Base {}',
    '// inheritance: framework base without a mixin\n@Injectable()\nclass A extends Base {}',
  ],
  invalid: [
    { code: 'class NpmInstaller extends NpmClient {}', filename: 'src/npm/installer.ts', errors: classInheritance },
    { code: 'export class Page<T> extends Base<T> {}', filename: 'src/x/page.ts', errors: classInheritance },
    { code: 'const A = class extends B {};', filename: 'src/x/a.ts', errors: classInheritance },
    { code: '// inheritance:\nclass A extends B {}', errors: classInheritance },
    { code: '// inheritance: reason\n\nclass A extends B {}', errors: classInheritance },
    { code: 'class A extends B {}', filename: 'src/x/dtoish/a.ts', errors: classInheritance },
    {
      code: '@Injectable()\nclass S extends Base {}',
      filename: 'src/x/s.dto.ts',
      errors: providerInheritance,
    },
    { code: 'export abstract class UsageLifecycle {}', errors: abstractClass },
    { code: 'abstract class Layer {\n  protected abstract readonly logger: Logger;\n}', errors: abstractClass },
    { code: '@Injectable()\nexport class ResourceUsageService extends UsageSessions {}', errors: providerInheritance },
    { code: '@Controller("plugins")\nexport class PluginController extends Routes {}', errors: providerInheritance },
    { code: '@Injectable()\nexport class PluginEmailService extends EmailService {}', errors: providerInheritance },
    // The marker must name a reason and sit directly above the class.
    { code: '// inheritance:\nexport abstract class Layer {}', errors: abstractClass },
    { code: '// inheritance: token\n\nexport abstract class Layer {}', errors: abstractClass },
    {
      code: '// inheritance: reason for another statement\nconst a = 1; export abstract class Layer {}',
      errors: abstractClass,
    },
    { code: '// unrelated comment\n@Injectable()\nexport class A extends Base {}', errors: providerInheritance },
  ],
});
