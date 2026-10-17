import type { Config } from 'tailwindcss';

const roles = [
  'primary', 'on-primary', 'primary-container', 'on-primary-container',
  'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container',
  'tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container',
  'error', 'on-error', 'error-container', 'on-error-container',
  'surface', 'on-surface', 'on-surface-variant', 'outline', 'outline-variant',
  'sc-lowest', 'sc-low', 'sc', 'sc-high', 'sc-highest',
  'inverse-surface', 'inverse-on-surface', 'inverse-primary',
  'success', 'success-container', 'on-success-container',
  'warning', 'on-warning', 'warning-container', 'on-warning-container',
];

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: Object.fromEntries(roles.map(r => [r, `var(--${r})`])) } },
  plugins: [],
} satisfies Config;
