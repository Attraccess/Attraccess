import { useAppTheme } from '@attraccess/ui';

function SumUpIconDarkTheme(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlSpace="preserve"
      style={
        {
          // enableBackground: "new 0 0 129.1 128",
        }
      }
      viewBox="0 0 129.1 128"
      {...props}
    >
      <path
        d="M119.9 0H9.2C4.1 0 0 4.1 0 9.1v109.7c0 5 4.1 9.1 9.2 9.1h110.7c5.1 0 9.2-4.1 9.2-9.1V9.1c0-5-4.1-9.1-9.2-9.1zM81.1 96.4c-11.3 11.2-29.3 11.7-41.1 1.5l-.2-.2c-.7-.7-.7-1.9 0-2.6l40-39.7c.7-.7 1.9-.7 2.6 0 10.5 11.7 10 29.7-1.3 41zm8.3-63.5-40 39.7c-.7.7-1.9.7-2.6 0-10.5-11.7-10.1-29.7 1.3-41C59.3 20.5 77.3 20 89.2 30.2l.2.2c.7.6.7 1.8 0 2.5z"
        style={{
          fill: '#fff',
        }}
      />
    </svg>
  );
}

function SumUpIconLightTheme(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlSpace="preserve"
      style={
        {
          // enableBackground: "new 0 0 129.1 128",
        }
      }
      viewBox="0 0 129.1 128"
      {...props}
    >
      <path d="M119.9 0H9.2C4.1 0 0 4.1 0 9.1v109.7c0 5 4.1 9.1 9.2 9.1h110.7c5.1 0 9.2-4.1 9.2-9.1V9.1c0-5-4.1-9.1-9.2-9.1zM81.1 96.4c-11.3 11.2-29.3 11.7-41.1 1.5l-.2-.2c-.7-.7-.7-1.9 0-2.6l40-39.7c.7-.7 1.9-.7 2.6 0 10.5 11.7 10 29.7-1.3 41zm8.3-63.5-40 39.7c-.7.7-1.9.7-2.6 0-10.5-11.7-10.1-29.7 1.3-41C59.3 20.5 77.3 20 89.2 30.2l.2.2c.7.6.7 1.8 0 2.5z" />
    </svg>
  );
}

export function SumUpIcon(props: React.SVGProps<SVGSVGElement>) {
  const { resolvedTheme } = useAppTheme();

  if (resolvedTheme === 'dark') {
    return <SumUpIconDarkTheme width={16} height={16} {...props} />;
  }

  return <SumUpIconLightTheme width={16} height={16} {...props} />;
}
