import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular"]
      },
      colors: {
        surface: "#101820",
        panel: "#16212b",
        line: "#283542",
        violetSignal: "#8b5cf6",
        profit: "#10b981",
        loss: "#f43f5e",
        caution: "#f59e0b"
      }
    }
  },
  plugins: []
};

export default config;

