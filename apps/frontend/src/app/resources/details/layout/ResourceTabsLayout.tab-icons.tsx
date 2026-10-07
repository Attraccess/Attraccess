import { Gauge, History as HistoryIcon, Users, WrenchIcon } from 'lucide-react';
import type { JSX } from 'react';
import { ResourceTabKey } from './useResourceTabs';
export const TAB_ICONS: Record<ResourceTabKey, JSX.Element> = {
  overview: <Gauge className="w-4 h-4" />,
  history: <HistoryIcon className="w-4 h-4" />,
  people: <Users className="w-4 h-4" />,
  maintenance: <WrenchIcon className="w-4 h-4" />,
};
