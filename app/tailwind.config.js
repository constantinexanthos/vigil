/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        bg: "#07080a",
        surface: "#0d0f12",
        border: "#2a2e37",
        cyan: "#22d3ee",
        "cyan-dim": "#0e7490",
        green: "#4ade80",
        red: "#ef4444",
        text: "#e4e4e7",
        "text-muted": "#71717a",
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
