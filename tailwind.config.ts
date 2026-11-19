import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#fafafa",
        ink: { DEFAULT: "#18181b", muted: "#71717a", faint: "#a1a1aa" },
        line: { DEFAULT: "#e8e8e8", soft: "#f1f1f0" },
        // Brand: EDGAR navy. The tool analyzes SEC EDGAR filings; navy is the source
        // institution's color family and sits outside the violet/indigo AI-default band.
        accent: { DEFAULT: "#16324f", hover: "#0f2439" },
      },
      // Deliberate choice for a filings-analysis tool: an explicit system stack matches the
      // plain presentation of the source material and needs zero font loading.
      fontFamily: { sans: ["ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
