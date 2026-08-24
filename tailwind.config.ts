import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop": {
          "0%": { transform: "scale(0.96)" },
          "100%": { transform: "scale(1)" },
        },
        wave: {
          "0%, 100%": { transform: "scaleY(0.45)" },
          "50%": { transform: "scaleY(1.15)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out both",
        "pop": "pop 0.2s ease-out both",
        wave: "wave 0.85s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
