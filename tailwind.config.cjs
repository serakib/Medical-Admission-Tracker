/** Tailwind build config. The runtime CDN compiler has been replaced by a local build. */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        medical: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b'
        },
        accent: {
          50: '#f0f9ff',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1'
        }
      },
      fontFamily: {
        sans: ['Noto Sans Bengali', 'Noto Sans', 'Vrinda', 'system-ui', 'sans-serif']
      }
    }
  },
  safelist: [
    {
      pattern: /(bg|text|border|ring|from|via|to)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)/,
      variants: ['dark', 'hover', 'focus', 'active']
    }
  ],
  plugins: []
};
