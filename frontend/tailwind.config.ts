import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAF5EA",
        panel: "#F5EDDB",
        base: "#FAF5EA",
        soft: "#C8D9CF",
        accent: "#E3B864",
        "honey-light": "#EBC97E",
        text: "#1C3A2A",
        muted: "#4A6B58",
        sage: "#7A9B88",
        "sage-pale": "#C8D9CF",
        "honey-pale": "#F2DEB0",
        cream: "#F5EDDB",
        "cream-light": "#FAF5EA",
        emerald: {
          100: "#C8D9CF",
          200: "#7A9B88",
          300: "#4A6B58",
          400: "#7A9B88",
          500: "#1C3A2A"
        },
        green: {
          100: "#C8D9CF",
          200: "#7A9B88",
          300: "#4A6B58",
          400: "#7A9B88",
          500: "#1C3A2A"
        },
        sky: {
          100: "#C8D9CF",
          200: "#7A9B88",
          400: "#7A9B88",
          500: "#4A6B58"
        },
        blue: {
          100: "#C8D9CF",
          200: "#7A9B88",
          400: "#7A9B88",
          500: "#4A6B58"
        },
        cyan: {
          200: "#7A9B88",
          400: "#7A9B88",
          500: "#4A6B58"
        },
        purple: {
          200: "#7A9B88",
          400: "#7A9B88",
          500: "#4A6B58"
        },
        yellow: {
          100: "#E3B864",
          200: "#E3B864",
          300: "#EBC97E",
          400: "#E3B864",
          500: "#E3B864"
        },
        amber: {
          100: "#E3B864",
          200: "#E3B864",
          300: "#EBC97E",
          400: "#E3B864",
          500: "#E3B864"
        },
        red: {
          200: "#4A6B58",
          300: "#4A6B58",
          400: "#4A6B58",
          500: "#1C3A2A"
        }
      },
      fontFamily: {
        sans: ["Sora", "system-ui", "sans-serif"]
      },
      boxShadow: {
        card: "0 10px 30px rgba(28, 58, 42, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
