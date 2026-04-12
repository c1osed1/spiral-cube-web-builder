/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit Variable", "Outfit", "system-ui", "sans-serif"]
      },
      colors: {
        surface: {
          950: "#050810",
          900: "#0a0f1a",
          850: "#0f1624",
          800: "#141d2e"
        }
      },
      boxShadow: {
        glow: "0 0 60px -12px rgba(139, 92, 246, 0.35)"
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to right, rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.06) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
