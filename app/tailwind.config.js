/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f1117",
        surface: "#161820",
        elevated: "#1c1e2a",
        border: "#232530",
        accent: "#3b82f6",
        amber: "#fbbf24",
        danger: "#ef4444",
        violet: "#a78bfa",
        "text-primary": "#e8e9ed",
        "text-secondary": "#8b8d98",
        "text-muted": "#5c5e6a",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
