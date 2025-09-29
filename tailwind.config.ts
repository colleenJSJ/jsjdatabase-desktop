import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // CSS Variable references
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        
        // Background hierarchy
        'background-primary': 'var(--background-primary)',
        'background-secondary': 'var(--background-secondary)',
        'background-tertiary': 'var(--background-tertiary)',
        
        // Text colors
        'text-primary': 'var(--text-primary)',
        'text-muted': 'var(--text-muted)',
        
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        
        // Claude interface colors
        'claude-sidebar': '#201E1D',
        'claude-bg': '#262625',
        'claude-card': '#30302E',
        'claude-border': '#3A3A38',
        'claude-input': '#1A1A19',
        
        // Category colors
        'medical': 'var(--medical)',
        'travel': 'var(--travel)',
        'household': 'var(--household)',
        'personal': 'var(--personal)',
        'pets': 'var(--pets)',
        'urgent': 'var(--urgent)',
        
        // Priority background colors
        'priority-high': '#9A5D5D',     // Muted red
        'priority-medium': '#8C7348',   // Muted gold
        'priority-low': '#5B7CA3',      // Muted blue
        
        // Button colors
        'button-create': '#6B8A6B',     // Create/Save/Complete buttons
        'button-pending': '#8C7348',    // Pending button
        'button-edit': '#5B7CA3',       // Edit button
        'button-delete': '#9A5D5D',     // Delete button
        
        // Gray color mapping to Claude palette
        gray: {
          50: '#F5F5F4',
          100: '#E5E5E4',
          200: '#C2C0B6',
          300: '#9A9A98',
          400: '#7A7A78',
          500: '#5A5A58',
          600: '#3A3A38',
          700: '#30302E',
          800: '#262625',
          900: '#201E1D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
}

export default config