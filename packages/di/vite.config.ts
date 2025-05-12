import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'di',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    sourcemap: true,
    minify: false, // 禁用代码压缩
    rollupOptions: {
      external: [
        'reflect-metadata'
      ]
    }
  },
  plugins: [
    dts({
      entryRoot: 'src',
    }),
  ],
})
