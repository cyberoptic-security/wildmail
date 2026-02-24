// src/theme.js
import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  styles: {
    global: {
      // Define custom CSS variables for light/dark mode hover colours
      ':root': {
        '--row-hover-bg-light': '#ebf8ff',  // light blue
        '--row-hover-bg-dark': '#2d3748'    // dark gray
      },
      '[data-theme="dark"]': {
        '--row-hover-bg': 'var(--row-hover-bg-dark)'
      },
      '[data-theme="light"]': {
        '--row-hover-bg': 'var(--row-hover-bg-light)'
      }
    }
  },
  components: {
    Table: {
      variants: {
        striped: {
          tbody: {
            tr: {
              _hover: {
                bg: 'var(--row-hover-bg)',
                color: 'inherit' // optional: don't force white text
              }
            }
          }
        }
      }
    }
  }
});

export default theme;