/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef4ff', 100: '#dbe6fe', 500: '#3b6ef5', 600: '#2553d9', 700: '#1e40af', 800: '#1e3a8a', 900: '#172554' },
      },
    },
  },
  plugins: [],
};
