/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0b0e",
        surface: "#15151b",
        surface2: "#1c1c24",
        surface3: "#222230",
        border: "#2b2b36",
        ink: "#c9344a",
        inkbright: "#e8475f",
        gold: "#c9a24b",
        muted: "#8d8b97",
        muted2: "#5f5d68",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: { xl2: "14px" },
    },
  },
  plugins: [],
};
