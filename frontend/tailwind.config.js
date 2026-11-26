/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
      },
      colors: {
        pronote: {
          DEFAULT: '#008673',
          light: '#6BC5B7',
          lighter: '#CDF3ED',
          dark: '#00584C',
          logo: '#009881',
          yellow: '#FACB4A',
        },
      },
    },
  },
  plugins: [],
}
