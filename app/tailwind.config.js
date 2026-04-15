/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#111113",
        surface: "#151518",
        border: "#1e1e21",
        "text-heading": "#fafafa",
        "text-primary": "#d4d4d8",
        "text-muted": "#71717a",
        "text-faint": "#52525b",
        "text-subtle": "#a1a1aa",
        warning: "#fbbf24",
        danger: "#ef4444",
        success: "#4ade80",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
