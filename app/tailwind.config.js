/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--color-surface)",
        elevated: "var(--color-surface-elevated)",
        secondary: "var(--color-secondary)",
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        tosca: {
          500: "var(--color-tosca-500)",
          600: "var(--color-tosca-600)",
          700: "var(--color-tosca-700)",
        },
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        elev1: "var(--shadow-elev-1)",
        elev2: "var(--shadow-elev-2)",
      },
      borderRadius: {
        md: "var(--radius-md)",
      },
      maxWidth: {
        desk: "72rem",
      },
    },
  },
  plugins: [],
};
