/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0b0e",
        surface: "#0f1115",
        elevated: "#14161c",
        border: "#1e2028",
        "border-hover": "#2a2d38",
        accent: "#22d3ee",
        amber: "#fbbf24",
        danger: "#ef4444",
        violet: "#a78bfa",
        "text-primary": "#e4e4e7",
        "text-secondary": "#9ca3af",
        "text-muted": "#4b5563",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
