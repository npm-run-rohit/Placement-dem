import type { Config } from 'tailwindcss';

/**
 * Tokens extracted from the designer prototype (docs/design/UI-SPEC.md s1). Colour carries meaning:
 * purple = primary action/chrome (never status); orange = attention/clarification; red = breach;
 * green = usable/success; blue = BimaPlacement accent/info; amber = DEV simulators only.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Anek Latin"', '"Anek Gujarati"', '"Anek Devanagari"', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          DEFAULT: '#1C1D1F',
          2: '#6F7378',
          3: '#A9ACB1',
          data: '#0E1A1F',
          data2: '#3D5058',
          data3: '#7C8F97',
        },
        line: { DEFAULT: '#D2D5D8', soft: '#ECECF1', subtle: '#E6E8EA', menu: '#DFE0E2' },
        canvas: '#F4F5F6',
        card: { DEFAULT: '#FFFFFF', alt: '#FAFAFB', sunk: '#F4F5F6' },
        brand: {
          50: '#F4F1FF',
          100: '#E8E2FF',
          200: '#EDE6FF',
          line: '#D1C6FF',
          400: '#7A4DEB',
          DEFAULT: '#4100CF',
          600: '#320099',
        },
        accent: '#FF7700',
        alert: '#F10000', // unread / needs-action dot
        greet: '#9082B3',
        placement: { DEFAULT: '#1458D2', bg: '#EEF4FF', nav: '#DDE8FF' },
        sem: { error: '#CF0000', caution: '#B38F0A', success: '#007B00' },
        t: {
          orange: { DEFAULT: '#A15C00', soft: '#FDF2E1', line: '#F2DBBE' },
          green: { DEFAULT: '#0F7A4C', soft: '#E4F5EC', line: '#B6E2CB' },
          red: { DEFAULT: '#B3261E', soft: '#FBEAE8', line: '#F1CCC8' },
          blue: { DEFAULT: '#1458D2', soft: '#E8F1FA', line: '#C3DAF0' },
          amber: { DEFAULT: '#8A6D1F', soft: '#FDF6DC', line: '#EFE0A8' },
          purple: { DEFAULT: '#320099', soft: '#F4F1FF', line: '#EDE6FF' },
          neutral: { DEFAULT: '#6F7378', soft: '#F4F5F6', line: '#E6E8EA' },
        },
      },
      fontSize: { '2xs': ['10.5px', '1.3'], meta: ['11.5px', '1.45'], dense: ['12.5px', '1.4'] },
      fontWeight: { 550: '550', 650: '650' },
      borderRadius: { shell: '24px' },
      boxShadow: {
        shell: '0 2px 8px rgba(28,27,31,0.06)',
        menu: '0 2px 16px rgba(169,172,177,0.24)',
        popover: '0 12px 32px rgba(28,29,31,0.16)',
        drawer: '-16px 0 40px rgba(28,29,31,0.16)',
        focus: '0 0 0 2px #E8E2FF',
        glow: '0 0 12px rgba(65,0,207,0.10)',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        modalIn: {
          from: { opacity: '0', transform: 'translateY(32px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        item: 'fadeUp .45s cubic-bezier(.22,1,.36,1) backwards',
        modal: 'modalIn .6s cubic-bezier(.5,0,.5,1) both',
      },
      spacing: { sidebar: '237px', 'sidebar-c': '92px', rail: '268px' },
    },
  },
  plugins: [],
} satisfies Config;
