import tailwindcssMotion from 'tailwindcss-motion';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      zIndex: {
        2147483647: '2147483647',
      },
    },
  },
  plugins: [tailwindcssMotion],
};
