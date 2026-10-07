import './styles.css';
import { Button } from '@heroui/react';
import { HandIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export // Shared shell so both pages get the title, intro and cross-links. Tailwind
// utility classes (`text-default-*`, `border-default-*`, …) resolve against the
// host's compiled stylesheet because the plugin renders inside the host DOM, so
// spacing and colours match the rest of the app in both light and dark mode.
function PluginShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hw:flex hw:flex-col hw:gap-6 hw:p-6 hw:max-w-4xl hw:mx-auto">
      <div className="hw:flex hw:items-center hw:gap-3">
        <HandIcon className="hw:w-6 hw:h-6 hw:text-primary" />
        <h1 className="hw:text-2xl hw:font-semibold hw:text-default-800">{title}</h1>
      </div>
      <nav className="hw:flex hw:gap-2">
        <Button as={Link} to="/hello-world" variant="ghost" size="sm" data-cy="hello-world-nav-greetings">
          Greetings
        </Button>
        <Button
          as={Link}
          to="/hello-world/capabilities"
          variant="ghost"
          size="sm"
          data-cy="hello-world-nav-capabilities"
        >
          Capabilities
        </Button>
      </nav>
      {children}
    </div>
  );
}
