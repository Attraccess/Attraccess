const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');
const { join } = require('path');
const { heroui } = require('@heroui/react');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'),
    ...createGlobPatternsForDependencies(__dirname),

    '../../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      keyframes: {
        draw: {
          to: {
            'stroke-dashoffset': '0',
            'stroke-dasharray': '0',
          },
        },
      },
      animation: {
        draw: 'draw 2s ease-in-out forwards',
      },
    },
  },
  darkMode: 'class',
  plugins: [heroui(), require('@tailwindcss/typography')],
};
