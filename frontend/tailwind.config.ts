import type { Config } from "tailwindcss";

/**
 * Sistema de diseño "Montevideo MAMBO".
 * Marca: negro + verde lima neón, estilo urbano/energético (ver /Referencias).
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Paleta de marca
        lime: {
          DEFAULT: "#C4F82B",
          bright: "#D9FF4D",
          dim: "#A5D420",
          deep: "#7BA015",
        },
        ink: {
          DEFAULT: "#0B0B0C", // fondo base
          900: "#0F0F11",
          800: "#141416", // paneles
          700: "#1B1B1F", // paneles elevados
          600: "#232329",
          500: "#2C2C33", // bordes
        },
        muted: {
          DEFAULT: "#8A8A93",
          soft: "#A8A8B0",
          dim: "#63636B",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(196,248,43,0.35), 0 8px 30px -6px rgba(196,248,43,0.35)",
        "glow-sm": "0 0 18px -4px rgba(196,248,43,0.45)",
        panel: "0 12px 40px -12px rgba(0,0,0,0.7)",
        "inner-line": "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      },
      backgroundImage: {
        "lime-grad": "linear-gradient(135deg, #D9FF4D 0%, #C4F82B 45%, #A5D420 100%)",
        "ink-grad": "linear-gradient(180deg, #141416 0%, #0B0B0C 100%)",
        "hero-grad":
          "radial-gradient(120% 120% at 80% -10%, rgba(196,248,43,0.18) 0%, rgba(196,248,43,0) 45%), radial-gradient(90% 90% at -10% 110%, rgba(196,248,43,0.10) 0%, rgba(196,248,43,0) 50%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-glow": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(196,248,43,0.45)" },
          "50%": { boxShadow: "0 0 0 8px rgba(196,248,43,0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "spin-slow": {
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.4s ease both",
        "pulse-glow": "pulse-glow 2s ease-out infinite",
        shimmer: "shimmer 1.5s infinite",
        "spin-slow": "spin-slow 1.1s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
