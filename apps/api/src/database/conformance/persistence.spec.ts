import { identityLifecycleConformance } from './lifecycle.suite';
import { createSqliteFixture } from './sqlite-fixture';

identityLifecycleConformance('SQLite', createSqliteFixture);

import { legacyUpgradeConformance } from './schema.suite';
import { createSqliteUpgradeFixture } from './upgrades.fixture';

legacyUpgradeConformance('SQLite', createSqliteUpgradeFixture);

import { createSqliteApplicationFixture } from './sqlite-fixture';
import { accountingConformance } from './accounting.suite';
import { usageLifecycleConformance } from './lifecycle.suite';
import { auditConformance } from './audit.suite';
import { sessionConformance } from './session.suite';
accountingConformance('SQLite', createSqliteApplicationFixture);
usageLifecycleConformance('SQLite', createSqliteApplicationFixture);
auditConformance('SQLite', createSqliteApplicationFixture);
sessionConformance('SQLite', createSqliteApplicationFixture);

import { pluginConformance, createSqlitePluginFixture } from './plugins.suite';
pluginConformance('SQLite', createSqlitePluginFixture);
