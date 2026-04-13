/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07080a",
        surface: "#0d0f12",
        border: "#1a1d23",
        "border-hover": "#2a2e37",
        accent: "#22d3ee",
        "text-primary": "#e4e4e7",
        "text-secondary": "#6b7084",
        "text-muted": "#3d4150",
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
