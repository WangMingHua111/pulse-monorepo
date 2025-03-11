import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'opc',
      fileName: 'index',
      formats: ['es', 'cjs', 'umd'],
    },
  },
  plugins: [
    dts({
      entryRoot: 'src',
      //   outDir: 'types',
    }),
  ],
})
