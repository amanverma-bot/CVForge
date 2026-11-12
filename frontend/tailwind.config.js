/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--color-${name}-rgb) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          foreground: token('on-primary'),
        },
        'on-primary': token('on-primary'),
        secondary: {
          DEFAULT: token('secondary'),
          hover: token('secondary-hover'),
          foreground: token('on-secondary'),
        },
        'on-secondary': token('on-secondary'),
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          foreground: token('on-accent'),
        },
        'on-accent': token('on-accent'),
        background: token('background'),
        foreground: token('foreground'),
        card: {
          DEFAULT: token('card'),
          foreground: token('card-foreground'),
        },
        muted: {
          DEFAULT: token('muted'),
          foreground: token('muted-foreground'),
        },
        border: token('border'),
        destructive: {
          DEFAULT: token('destructive'),
          hover: token('destructive-hover'),
          foreground: token('on-destructive'),
        },
        'on-destructive': token('on-destructive'),
        ring: token('ring'),
        success: token('success'),
        warning: token('warning'),
        info: token('info'),
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        heading: ['var(--font-heading)'],
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [],
};
