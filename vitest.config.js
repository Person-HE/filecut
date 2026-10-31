import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'tests/unit/**/*.test.js',
      'tests/composables/**/*.test.js',
      'tests/components/**/*.test.js',
      'tests/router/**/*.test.js',
      'tests/config/**/*.test.js'
    ],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/utils/**',
        'src/composables/**',
        'src/components/**',
        'src/router/categories.js'
      ]
    }
  }
})
