import React from 'react';
import { Button } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

interface NavigationButtonsData {
  type: 'navigation-buttons';
  buttons: {
    label: string;
    route: string;
    variant?: 'primary' | 'secondary' | 'flat';
  }[];
}

export function NavigationButtons({ data }: { data: NavigationButtonsData }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap gap-2 my-2">
      {data.buttons.map((btn, i) => {
        const isExternal = btn.route.startsWith('http') || btn.route.startsWith('/docs/');
        const color = btn.variant === 'primary' ? 'primary' : 'default';
        const variant = btn.variant === 'flat' ? 'flat' : 'bordered';

        if (isExternal) {
          return (
            <Button
              key={i}
              size="sm"
              color={color}
              variant={variant}
              as="a"
              href={btn.route}
              target="_blank"
              rel="noopener noreferrer"
              endContent={<ExternalLink size={12} />}
            >
              {btn.label}
            </Button>
          );
        }

        return (
          <Button
            key={i}
            size="sm"
            color={color}
            variant={variant}
            onPress={() => navigate(btn.route)}
          >
            {btn.label}
          </Button>
        );
      })}
    </div>
  );
}

export function isNavigationButtons(data: unknown): data is NavigationButtonsData {
  const d = data as Record<string, unknown>;
  return d?.type === 'navigation-buttons' && Array.isArray(d?.buttons);
}
