/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07080a",
        surface: "#0d0f12",
        elevated: "#12141a",
        border: "#1a1d23",
        "border-hover": "#2a2e37",
        accent: "#00ff41",
        cyan: "#00d9ff",
        amber: "#ffb800",
        danger: "#ff3333",
        violet: "#a78bfa",
        "text-primary": "#e4e4e7",
        "text-secondary": "#6b7084",
        "text-muted": "#3d4150",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
