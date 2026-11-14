/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefaf9',
          100: '#d7f3f0',
          500: '#2a8a8c',
          600: '#1d6f73',
          700: '#185d61',
          900: '#163b40',
        },
        accent: '#eaf6ff',
      },
      boxShadow: {
        soft: '0 12px 32px rgba(14, 30, 37, 0.08)',
      },
    },
  },
  plugins: [],
}

