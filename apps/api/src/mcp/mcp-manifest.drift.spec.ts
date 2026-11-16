import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { analyzeMcpManifest, McpManifestEntry, OpenApiDocument } from './openapi-tools';
import { buildHostOpenApiDocument } from './host-openapi-document.test-fixture';
import { classifyOperation } from './reviewed-manifest.classifier.test-fixture';

const manifestPath = join(__dirname, 'reviewed-manifest.json');
const readManifest = () => JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, McpManifestEntry>;

/**
 * Developer helper: `MCP_MANIFEST_WRITE=1` adds unreviewed operations with a first-pass classification, removes stale
 * entries and re-pins the shape of drifted ones (keep decisions you have re-reviewed); `MCP_MANIFEST_WRITE=reclassify`
 * reclassifies everything. Review the resulting diff before committing.
 */
function writeProposedManifest(document: OpenApiDocument, mode: string): void {
  const current = readManifest();
  const { operations, problems } = analyzeMcpManifest(document, mode === 'reclassify' ? {} : current);
  const shapes = new Map(problems.filter((p) => p.shape).map((p) => [p.operationId, p.shape as string]));
  const next: Record<string, McpManifestEntry> = {};
  for (const operation of operations) {
    const existing = mode === 'reclassify' ? undefined : current[operation.id];
    const { decision, reason } = existing ?? classifyOperation(operation);
    const shape = shapes.get(operation.id) ?? existing?.shape;
    if (shape) next[operation.id] = { decision, reason, shape };
  }
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
}

describe('MCP reviewed manifest drift', () => {
  let document: OpenApiDocument;

  beforeAll(async () => {
    document = await buildHostOpenApiDocument();
    if (process.env.MCP_MANIFEST_WRITE) writeProposedManifest(document, process.env.MCP_MANIFEST_WRITE);
  }, 240_000);

  it('covers every host operation, with no stale, drifted or incompatible entry', () => {
    const { problems } = analyzeMcpManifest(document, readManifest());
    if (problems.length === 0) return;
    throw new Error(
      [
        `${problems.length} MCP manifest problem(s). Edit apps/api/src/mcp/reviewed-manifest.json (see apps/api/src/mcp/README.md);`,
        '`MCP_MANIFEST_WRITE=1 pnpm nx test api --testFile=mcp-manifest.drift` proposes entries for review.',
        ...problems.map((problem) => `- [${problem.kind}] ${problem.detail}`),
      ].join('\n'),
    );
  });

  it('never allows an operation with a vague reason', () => {
    const vague = Object.entries(readManifest()).filter(([, entry]) => entry.reason.trim().length < 20);
    expect(vague.map(([id]) => id)).toEqual([]);
  });

  it('exposes no plugin operations', () => {
    const { tools } = analyzeMcpManifest(document, readManifest());
    expect(tools.filter((tool) => /^\/api\/(wago|matter|shelly|rabbitmq|reservations)(\/|$)/.test(tool.path))).toEqual(
      [],
    );
  });
});
