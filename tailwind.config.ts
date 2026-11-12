import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // HANAB-huisstijl (hanab.nl): navy-blauw + lichtblauw, accent rood.
        hanab: {
          50: "#eef6fd",
          100: "#d7ecfb",
          light: "#bce4fa",
          500: "#62bfff",
          600: "#0a5c92",
          700: "#00416e",
          800: "#002b5e",
          900: "#00214b",
          accent: "#e63223", // HANAB-rood (CTA)
          accentDark: "#c4281b",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
