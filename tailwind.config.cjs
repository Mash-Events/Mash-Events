/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,jsx,ts,tsx,mdx}',
    './src/components/**/*.{js,jsx,ts,tsx,mdx}',
    './src/app/**/*.{js,jsx,ts,tsx,mdx}',
    './core/**/*.{js,jsx,ts,tsx,mdx}',
    './sites/**/*.{js,jsx,ts,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* Standardized Border Radius */
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
        full: 'var(--radius-full)',
      },

      /* Spacing Scale for Sections */
      spacing: {
        'section-sm': 'var(--spacing-section-sm)',
        'section-md': 'var(--spacing-section-md)',
        'section-lg': 'var(--spacing-section-lg)',
        'section-xl': 'var(--spacing-section-xl)',
        'comp-xs': 'var(--spacing-component-xs)',
        'comp-sm': 'var(--spacing-component-sm)',
        'comp-md': 'var(--spacing-component-md)',
        'comp-lg': 'var(--spacing-component-lg)',
        'comp-xl': 'var(--spacing-component-xl)',
      },

      /* Typography / Font Sizes */
      fontSize: {
        'display-xl': [
          'var(--text-display-xl)',
          {
            lineHeight: 'var(--line-height-tight)',
            fontWeight: 'var(--font-weight-extrabold)',
          },
        ],
        'display-lg': [
          'var(--text-display-lg)',
          {
            lineHeight: 'var(--line-height-tight)',
            fontWeight: 'var(--font-weight-extrabold)',
          },
        ],
        'display-md': [
          'var(--text-display-md)',
          {
            lineHeight: 'var(--line-height-tight)',
            fontWeight: 'var(--font-weight-extrabold)',
          },
        ],
        'display-sm': [
          'var(--text-display-sm)',
          {
            lineHeight: 'var(--line-height-tight)',
            fontWeight: 'var(--font-weight-bold)',
          },
        ],
        'heading-lg': [
          'var(--text-heading-lg)',
          {
            lineHeight: 'var(--line-height-snug)',
            fontWeight: 'var(--font-weight-bold)',
          },
        ],
        'heading-md': [
          'var(--text-heading-md)',
          {
            lineHeight: 'var(--line-height-snug)',
            fontWeight: 'var(--font-weight-bold)',
          },
        ],
        'heading-sm': [
          'var(--text-heading-sm)',
          {
            lineHeight: 'var(--line-height-snug)',
            fontWeight: 'var(--font-weight-bold)',
          },
        ],
        'heading-xs': [
          'var(--text-heading-xs)',
          {
            lineHeight: 'var(--line-height-normal)',
            fontWeight: 'var(--font-weight-semibold)',
          },
        ],
        'body-lg': [
          'var(--text-body-lg)',
          { lineHeight: 'var(--line-height-relaxed)' },
        ],
        'body-md': [
          'var(--text-body-md)',
          { lineHeight: 'var(--line-height-normal)' },
        ],
        'body-sm': [
          'var(--text-body-sm)',
          { lineHeight: 'var(--line-height-normal)' },
        ],
        'body-xs': [
          'var(--text-body-xs)',
          { lineHeight: 'var(--line-height-normal)' },
        ],
      },

      /* Font Weights */
      fontWeight: {
        normal: 'var(--font-weight-normal)',
        medium: 'var(--font-weight-medium)',
        semibold: 'var(--font-weight-semibold)',
        bold: 'var(--font-weight-bold)',
        extrabold: 'var(--font-weight-extrabold)',
        black: 'var(--font-weight-black)',
      },

      /* Letter Spacing */
      letterSpacing: {
        tight: 'var(--letter-spacing-tight)',
        normal: 'var(--letter-spacing-normal)',
        wide: 'var(--letter-spacing-wide)',
        wider: 'var(--letter-spacing-wider)',
        widest: 'var(--letter-spacing-widest)',
      },

      /* Line Heights */
      lineHeight: {
        tight: 'var(--line-height-tight)',
        snug: 'var(--line-height-snug)',
        normal: 'var(--line-height-normal)',
        relaxed: 'var(--line-height-relaxed)',
        loose: 'var(--line-height-loose)',
      },

      /* Font Families */
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        heading: ['var(--font-outfit)', 'sans-serif'],
      },

      /* Box Shadows */
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)',
      },

      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        // RightsCon Theme Colors (Primary Design System)
        rc: {
          primary: 'hsl(var(--rc-primary))',
          'primary-foreground': 'hsl(var(--rc-primary-foreground))',
          secondary: 'hsl(var(--rc-secondary))',
          'secondary-foreground': 'hsl(var(--rc-secondary-foreground))',
          accent: 'hsl(var(--rc-accent))',
          'accent-foreground': 'hsl(var(--rc-accent-foreground))',
          background: 'hsl(var(--rc-background))',
          foreground: 'hsl(var(--rc-foreground))',
          muted: 'hsl(var(--rc-muted))',
          'muted-foreground': 'hsl(var(--rc-muted-foreground))',
          border: 'hsl(var(--rc-border))',
        },
      },
    },
  },
  plugins: [],
};
