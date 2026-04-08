import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0A0E12",
        panel: "#111821",
        soft: "#1B2734",
        accent: "#2EC4B6",
        amber: "#F4B942",
        text: "#E6EDF5",
        muted: "#8AA0B6"
      },
      fontFamily: {
        sans: ["Sora", "system-ui", "sans-serif"]
      },
      boxShadow: {
        card: "0 10px 30px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
