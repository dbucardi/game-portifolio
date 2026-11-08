import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Maps each shade of a semantic scale to the same shade of a primitive palette. */
function shades(palette: string): Record<(typeof SHADES)[number], string> {
  return Object.fromEntries(SHADES.map((shade) => [shade, `{${palette}.${shade}}`])) as Record<(typeof SHADES)[number], string>;
}

/** Colors from the game art; see docs/PALETTE.md. `brand` is the action color, `dragon` red is kept for danger only. */
export const MugloarPreset = definePreset(Aura, {
  primitive: {
    parchment: {
      50: '#fbf6ea',
      100: '#f5ebd3',
      200: '#ecdcb4',
      300: '#e4ca94',
      400: '#d1b583',
      500: '#bfa174',
      600: '#9b7f55',
      700: '#6c5f49',
      800: '#4a3a26',
      900: '#2e2214',
      950: '#1c140b',
    },
    brand: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
      950: '#1e1b4b',
    },
    dragon: {
      50: '#fdeceb',
      100: '#fbd0cc',
      200: '#f6a39b',
      300: '#ef7466',
      400: '#e3442d',
      500: '#c41311',
      600: '#a40e0d',
      700: '#830b0b',
      800: '#5e0808',
      900: '#3b0606',
      950: '#260404',
    },
    gold: {
      50: '#fffbea',
      100: '#fef3b9',
      200: '#fbe38a',
      300: '#f5c86a',
      400: '#e8b04a',
      500: '#d49a2a',
      600: '#b07d1c',
      700: '#8f6114',
      800: '#6b4500',
      900: '#4d330a',
      950: '#2e1f06',
    },
    forest: {
      50: '#e8f1ef',
      100: '#c9ddd9',
      200: '#9cc0b9',
      300: '#6a9d94',
      400: '#3f7a71',
      500: '#2b5f57',
      600: '#214844',
      700: '#173833',
      800: '#0f2a27',
      900: '#062120',
      950: '#011717',
    },
  },
  semantic: {
    primary: shades('brand'),
    focusRing: { width: '2px', style: 'solid', color: '{forest.600}', offset: '2px' },
    colorScheme: {
      light: {
        surface: { 0: '#ffffff', ...shades('parchment') },
        primary: {
          color: '{brand.600}',
          contrastColor: '#ffffff',
          hoverColor: '{brand.700}',
          activeColor: '{brand.800}',
        },
        text: { color: '{parchment.900}', mutedColor: '{parchment.700}' },
        content: {
          background: '{parchment.50}',
          borderColor: '{parchment.400}',
          color: '{parchment.900}',
        },
      },
      dark: {
        surface: { 0: '#ffffff', ...shades('forest') },
        primary: {
          color: '{brand.400}',
          contrastColor: '{parchment.950}',
          hoverColor: '{brand.300}',
          activeColor: '{brand.200}',
        },
        text: { color: '{parchment.100}', mutedColor: '{parchment.300}' },
        content: {
          background: '{forest.900}',
          borderColor: '{forest.700}',
          color: '{parchment.100}',
        },
        focusRing: { color: '{gold.200}' },
      },
    },
  },
  components: {
    button: {
      colorScheme: {
        light: {
          outlined: {
            secondary: {
              hoverBackground: '{parchment.200}',
              activeBackground: '{parchment.300}',
              borderColor: '{parchment.600}',
              color: '{parchment.800}',
            },
          },
        },
        dark: {
          outlined: {
            secondary: {
              hoverBackground: '{forest.800}',
              activeBackground: '{forest.700}',
              borderColor: '{forest.300}',
              color: '{parchment.200}',
            },
          },
        },
      },
    },
  },
});
