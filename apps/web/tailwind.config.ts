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
        caution: "#f59e0b",
        obsidian: {
          bg: "#0b1326",
          deepest: "#060e20",
          container: "#171f33",
          "container-low": "#131b2e",
          bright: "#31394d",
          on: "#dae2fd",
          muted: "#ccc3d8",
          outline: "#958da1",
          "outline-variant": "#4a4455",
          primary: "#d2bbff",
          "primary-container": "#7c3aed",
          secondary: "#4edea3"
        }
      },
      spacing: {
        "stack-sm": "8px",
        "stack-md": "16px",
        "stack-lg": "32px",
        "panel-padding": "20px",
        gutter: "16px"
      }
    }
  },
  plugins: []
};

export default config;
