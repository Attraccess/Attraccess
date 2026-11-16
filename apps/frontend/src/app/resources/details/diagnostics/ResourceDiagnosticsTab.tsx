// Admin diagnostics surface over the machine operating timeline (ATT-1024):
// current state, transition history, unattributed operation, data quality and verification.
// FEATURE: ATT-1024 operating-timeline diagnostics tab

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DataQualitySection } from './DataQualitySection';
import { OperatingStateSection } from './OperatingStateSection';
import { TransitionsSection } from './TransitionsSection';
import { UnattributedSection } from './UnattributedSection';
import { VerificationSection } from './VerificationSection';
import { rangeToBounds } from './diagnosticsRange';

export function ResourceDiagnosticsTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number.parseInt(id ?? '', 10);
  // The range picker belongs to the unattributed section but also scopes data quality and verification.
  const [rangeDays, setRangeDays] = useState<string>('30');
  const range = useMemo(() => rangeToBounds(rangeDays), [rangeDays]);

  return (
    <div className="flex flex-col gap-4 pb-8" data-testid="resource-diagnostics-tab">
      <OperatingStateSection resourceId={resourceId} />
      <DataQualitySection resourceId={resourceId} range={range} />
      <UnattributedSection
        resourceId={resourceId}
        range={range}
        rangeDays={rangeDays}
        onRangeDaysChange={setRangeDays}
      />
      <VerificationSection key={rangeDays} resourceId={resourceId} range={range} />
      <TransitionsSection resourceId={resourceId} />
    </div>
  );
}

export default ResourceDiagnosticsTab;
