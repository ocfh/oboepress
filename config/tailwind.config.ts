import type { Config } from "tailwindcss";
import path from "path";

const config: Config = {
  content: [
    path.resolve("app", "**", "*.{ts,tsx}"),
    path.resolve("components", "**", "*.{ts,tsx}"),
    path.resolve("themes", "**", "*.{ts,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#4f46e5",
          fg: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
