import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/planr/',
  define: {
    // @turbodocx/html-to-docx (esm build) references `global` at runtime to
    // detect Buffer/Blob support. Map it to `globalThis` so Vite's browser
    // bundle doesn't throw "global is not defined".
    global: 'globalThis',
  },
});
