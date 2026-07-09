/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Design tokens (defined in index.css :root) ──────────────────
        // hsl(var(--x) / <alpha-value>) keeps opacity modifiers working,
        // e.g. bg-primary/20, border-border/10 — same pattern already used
        // throughout the app with border-white/10 etc.
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--primary-foreground) / <alpha-value>)',
        secondary: 'hsl(var(--secondary) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        destructive: 'hsl(var(--destructive) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        ring: 'hsl(var(--primary) / <alpha-value>)',
        // Legacy aliases — kept so any existing bg-brand-primary usage still
        // resolves, now pointed at the same token instead of a separate hex.
        'brand-primary': 'hsl(var(--primary) / <alpha-value>)',
        'brand-secondary': 'hsl(var(--secondary) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Unbounded', 'ui-sans-serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
