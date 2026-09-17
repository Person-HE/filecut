import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'

// Cloudflare Pages 静态部署配置
// 所有处理在浏览器端完成，零后端依赖
export default defineConfig({
  plugins: [vue(), wasm()],
  base: '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        // 大型库单独分包，避免单 chunk 过大
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
          'pdflib': ['pdf-lib'],
          'sheetjs': ['xlsx'],
          'docx': ['docx-preview', 'mammoth'],
          'image': ['browser-image-compression', 'cropperjs', 'exifr'],
          'wasm': ['hash-wasm', '@imgly/background-removal']
        }
      }
    }
  },
  // 大文件处理相关 - 允许 wasm 大文件
  optimizeDeps: {
    exclude: [
      '@imgly/background-removal',
      'pdfjs-dist',
      'gif.js',
      'tesseract.js',
      'svgo',
      'opentype.js'
    ],
    include: [
      'pdf-lib',
      'jszip',
      'pizzip',
      'xlsx',
      'mammoth',
      'docx-preview',
      'browser-image-compression',
      'cropperjs',
      'exifr',
      'papaparse',
      'js-yaml',
      'fast-xml-parser',
      'marked',
      'turndown',
      'crypto-js',
      'hash-wasm',
      'qrcode',
      'jsqr',
      '@zxing/library',
      'heic2any',
      'piexifjs',
      'pptxgenjs',
      'docxtemplater',
      'iconv-lite',
      'pako',
      'fflate',
      '@ffmpeg/ffmpeg',
      '@ffmpeg/util'
    ]
  },
  server: {
    headers: {
      // 启用 SharedArrayBuffer 多线程 WASM
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  }
})
