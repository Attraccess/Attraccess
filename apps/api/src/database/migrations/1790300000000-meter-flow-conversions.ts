import { MigrationInterface, QueryRunner } from 'typeorm';

// Energy-specific definitions stay here. The runtime evaluates generic flow expressions only.
const FACTORS: Record<string, string> = {
  mWh: '1/1000000',
  MWh: '1000',
  Wh: '1/1000',
  kWh: '1',
  J: '1/3600000',
  kJ: '1/3600',
  MJ: '5/18',
  wh: '1/1000',
  kwh: '1',
  whs: '1/1000',
  kwhs: '1',
};
for (const [name, factor] of Object.entries({
  'milliwatt-hour': '1/1000000',
  'watt-hour': '1/1000',
  'kilowatt-hour': '1',
  'megawatt-hour': '1000',
  joule: '1/3600000',
  kilojoule: '1/3600',
  megajoule: '5/18',
})) {
  FACTORS[name] = factor;
  FACTORS[name + 's'] = factor;
}

function operand(template: string): string {
  if (!template.includes('{{')) return JSON.stringify(template);
  // Simple payload paths stay readable; render preserves blocks, helpers and mixed text.
  const path = /^\s*\{\{\{?\s*([\w@./-]+)\s*\}\}\}?\s*$/.exec(template);
  return path ? path[1] : `(render ${JSON.stringify(template)})`;
}

export class MeterFlowConversions1790300000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const nodes: { id: string; type: string; data: string | null }[] = await runner.query(
      "SELECT id, type, data FROM resource_flow_node WHERE type LIKE '%.resource.metering.%'",
    );
    for (const node of nodes) {
      const data = JSON.parse(node.data ?? '{}');
      if (data.legacyEnergyUnit === undefined) continue;
      const field = node.type.endsWith('.ready') ? 'baselineValue' : 'value';
      const unit = String(data.legacyEnergyUnit);
      const key = unit.trim();
      const fixedFactor = unit.includes('{{')
        ? undefined
        : Object.hasOwn(FACTORS, key)
          ? FACTORS[key]
          : Object.hasOwn(FACTORS, key.toLowerCase())
            ? FACTORS[key.toLowerCase()]
            : undefined;
      if (
        (node.type.endsWith('.ready') || node.type.endsWith('.report')) &&
        typeof data[field] === 'string' &&
        data[field].trim()
      ) {
        // Even invalid/missing dynamic units retain validation through the generic lookup.
        const factor = fixedFactor
          ? JSON.stringify(fixedFactor)
          : `(mapValue ${operand(unit)} ${JSON.stringify(JSON.stringify(FACTORS))} foldCase=true)`;
        if (fixedFactor !== '1') data[field] = `{{scaleDecimal ${operand(data[field])} ${factor} min=0}}`;
      }
      delete data.legacyEnergyUnit;
      await runner.query('UPDATE resource_flow_node SET data = ? WHERE id = ?', [JSON.stringify(data), node.id]);
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const nodes: { data: string | null }[] = await runner.query('SELECT data FROM resource_flow_node');
    if (nodes.some(({ data }) => data && /(?:\{\{\s*|\()scaleDecimal\s/.test(data)))
      throw new Error(
        'Cannot revert flow conversions to a runtime without exact scaling. Restore a pre-migration backup instead.',
      );
  }
}
