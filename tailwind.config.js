/** @type {import('tailwindcss').Config} */
export default {
  // Manual toggle, not just the OS setting -- a `dark` class on <html>,
  // applied by src/hooks/useTheme.js. Falls back to the OS preference
  // only when the user hasn't chosen explicitly (see index.html's
  // early-apply script, which sets the class before React even mounts
  // so there's no flash of the wrong theme on load).
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
