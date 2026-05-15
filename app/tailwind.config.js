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
        // V2a semantic tokens — new names, don't clobber the older ones above.
        ok: "#4ade80",
        warn: "#fbbf24",
        bad: "#ef4444",
        info: "#60a5fa",
        claudefam: "#a78bfa",
        gptfam: "#f472b6",
        // Proxy-tab palette — six tokens, restraint-first (Linear-tier pass).
        // Every proxy/ component pulls from `vigil.*` so the color audit is a
        // single namespace grep. The accent is the ONLY hue; everything else
        // is a neutral.
        vigil: {
          bg:      "#0d0d0f",
          surface: "#17171c",
          ink:     "#ECECF1",
          mute:    "#8A8A93",
          rule:    "rgba(255,255,255,0.06)",
          accent:  "#5B8DEF",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "Inter", "system-ui", "sans-serif"],
        mono: ['"SF Mono"', '"JetBrains Mono"', '"IBM Plex Mono"', "Menlo", "monospace"],
      },
      fontSize: {
        xs: "11px", sm: "12px", base: "13px", lg: "14px", xl: "16px",
        // V2a scale
        label: ["9px", { letterSpacing: "0.08em" }],
        stat: ["10px", { lineHeight: "1.5" }],
        feed: ["11.5px", { lineHeight: "1.8" }],
        title: ["14px", { lineHeight: "1.3", fontWeight: "600" }],
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "8px", lg: "10px" },
      boxShadow: {
        subtle: "0 0 0 0.5px rgba(0,0,0,0.1)",
        card: "0 0 0 0.5px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        elevated: "0 0 0 0.5px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06)",
      },
      transitionDuration: { fast: "120ms", base: "180ms", slow: "400ms" },
      transitionTimingFunction: {
        "spring-overshoot": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        "pulse-alive": {
          "0%,100%": { opacity: "0.6" },
          "50%":     { opacity: "1"   },
        },
      },
      animation: {
        "pulse-alive": "pulse-alive 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
