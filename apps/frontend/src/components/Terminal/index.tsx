import { Button, cn } from '@heroui/react';
import { ArrowDownToLineIcon } from 'lucide-react';
import { useState } from 'react';

interface Props {
  logLines: string[];
  maxHeight: string;
}

export function Terminal(props: Props) {
  const [autoScroll, setAutoScroll] = useState(true);

  return (
    <div className="bg-black rounded-md p-4 mt-2 border border-gray-700 shadow-lg">
      <div
        className="font-mono text-xs text-green-400 overflow-auto whitespace-pre-wrap relative"
        style={{ maxHeight: props.maxHeight }}
        ref={(el) => {
          if (!autoScroll) {
            return;
          }

          if (el && props.logLines.length > 0) {
            el.scrollTop = el.scrollHeight;
          }
        }}
      >
        {props.logLines.map((line, index) => (
          <div key={index} className="py-0.5">
            {line || ' '}
          </div>
        ))}

        <Button
          className={cn('sticky bottom-0 left-[100%]', autoScroll ? 'animate-pulse' : '')}
          isIconOnly
          startContent={<ArrowDownToLineIcon />}
          onPress={() => setAutoScroll(!autoScroll)}
        />
      </div>
    </div>
  );
}
