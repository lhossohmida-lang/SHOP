import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        leaf: {
          50: "#f1f8ee",
          100: "#dff0d6",
          200: "#c5e5b8",
          300: "#9bd28a",
          400: "#6ebb68",
          500: "#49a35c",
          600: "#328447",
          700: "#26683a",
        },
        citrus: {
          100: "#fff4bc",
          400: "#facc15",
          500: "#eab308",
        },
        market: {
          orange: "#f97316",
          ink: "#17231c",
        },
      },
      boxShadow: {
        glass: "0 16px 50px rgba(23, 35, 28, 0.10)",
        soft: "0 8px 24px rgba(23, 35, 28, 0.08)",
      },
      fontFamily: {
        arabic: ["Tahoma", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
