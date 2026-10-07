import { ArrowDownToLine, ArrowUpFromLine, Radio } from 'lucide-react';
export const purposes = [
  {
    id: 'output',
    icon: ArrowUpFromLine,
  },
  {
    id: 'pulse',
    icon: Radio,
  },
  {
    id: 'input',
    icon: ArrowDownToLine,
  },
  {
    id: 'guard',
    icon: ArrowUpFromLine,
  },
] as const;
