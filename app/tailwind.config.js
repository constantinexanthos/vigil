/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#1C1C1E", secondary: "#2C2C2E", tertiary: "#3A3A3C", elevated: "#48484A" },
        text: { primary: "#F9FAFB", secondary: "#D1D5DB", tertiary: "#9CA3AF", muted: "#6B7280" },
        border: { DEFAULT: "rgba(255,255,255,0.06)", strong: "rgba(255,255,255,0.1)" },
        accent: "#3B82F6",
        green: "#15803D",
        amber: "#D97706",
        red: "#B91C1C",
        purple: "#7C3AED",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "Inter", "system-ui", "sans-serif"],
        mono: ['"SF Mono"', '"JetBrains Mono"', '"IBM Plex Mono"', "Menlo", "monospace"],
      },
      fontSize: { xs: "11px", sm: "12px", base: "13px", lg: "14px", xl: "16px" },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "8px", lg: "10px" },
      boxShadow: {
        subtle: "0 0 0 0.5px rgba(0,0,0,0.1)",
        card: "0 0 0 0.5px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        elevated: "0 0 0 0.5px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
