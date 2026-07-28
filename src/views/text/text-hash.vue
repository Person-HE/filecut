<script setup>
/**
 * 文本哈希计算 - MD5/SHA1/SHA256/SHA512
 * 用 Web Crypto API，MD5 用 crypto-js (Web Crypto 不支持 MD5)
 */
import { ref, computed } from 'vue'
import CryptoJS from 'crypto-js'
import ToolLayout from '../../components/ToolLayout.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const input = ref('')
const results = ref({})  // { md5, sha1, sha256, sha512 }
const processing = ref(false)
const error = ref('')

const inputStats = computed(() => {
  if (!input.value) return null
  return {
    chars: input.value.length,
    bytes: new Blob([input.value]).size
  }
})

async function computeHash(algorithm) {
  if (algorithm === 'md5') {
    return CryptoJS.MD5(input.value).toString()
  }
  // SHA-1, SHA-256, SHA-512 用 Web Crypto API
  const algMap = {
    'sha1': 'SHA-1',
    'sha256': 'SHA-256',
    'sha512': 'SHA-512'
  }
  const data = new TextEncoder().encode(input.value)
  const hashBuffer = await crypto.subtle.digest(algMap[algorithm], data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function computeAll() {
  if (!input.value) {
    showError('请输入文本')
    return
  }
  error.value = ''
  results.value = {}
  processing.value = true

  await safeRun(async () => {
    const r = {}
    for (const alg of ['md5', 'sha1', 'sha256', 'sha512']) {
      try {
        r[alg] = await computeHash(alg)
      } catch (e) {
        r[alg] = `计算失败: ${e.message}`
      }
    }
    results.value = r
  }, '哈希计算失败')

  processing.value = false
}

function copyHash(text) {
  navigator.clipboard.writeText(text)
    .then(() => showError('已复制'))
    .catch(() => showError('复制失败'))
}

function downloadHash(alg, hash) {
  const text = `${alg.toUpperCase()} Hash
Input: ${input.value.length > 200 ? input.value.slice(0, 200) + '...' : input.value}
Hash:  ${hash}
Length: ${hash.length} hex chars (${hash.length / 2} bytes)
Generated: ${new Date().toISOString()}
`
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  downloadBlob(blob, `${alg}-hash.txt`)
}

function clearAll() {
  input.value = ''
  results.value = {}
  error.value = ''
}

function loadSample() {
  input.value = 'Hello, FileCut! 这是一个测试文本。'
}

const hashLabels = {
  md5: { name: 'MD5', bits: 128, deprecated: true },
  sha1: { name: 'SHA-1', bits: 160, deprecated: true },
  sha256: { name: 'SHA-256', bits: 256, deprecated: false },
  sha512: { name: 'SHA-512', bits: 512, deprecated: false }
}
</script>

<template>
  <ToolLayout title="文本哈希计算" desc="计算MD5/SHA1/SHA256/SHA512哈希值" icon="#">
    <div class="nb-card">
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="nb-btn sm" @click="loadSample">📝 示例</button>
          <button class="nb-btn sm" @click="clearAll">✕ 清空</button>
        </div>
        <div v-if="inputStats" class="stats">
          <span class="nb-tag">{{ inputStats.chars }} 字符</span>
          <span class="nb-tag">{{ inputStats.bytes }} 字节</span>
        </div>
      </div>

      <div class="mt-16">
        <label class="nb-label">输入文本</label>
        <textarea v-model="input" class="nb-textarea" rows="6"
                  placeholder="输入要计算哈希的文本..." spellcheck="false"></textarea>
      </div>

      <div class="mt-16">
        <button class="nb-btn primary lg" @click="computeAll" :disabled="processing">
          <span v-if="processing"><span class="nb-spinner"></span> 计算中...</span>
          <span v-else># 计算所有哈希</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="Object.keys(results).length" class="nb-card mt-16">
      <h3 class="nb-h3">📊 哈希结果</h3>
      <div class="hash-list mt-16">
        <div v-for="(hash, alg) in results" :key="alg" class="hash-item">
          <div class="hash-header">
            <span class="nb-tag accent">{{ hashLabels[alg].name }}</span>
            <span class="nb-tag">{{ hashLabels[alg].bits }} bits</span>
            <span v-if="hashLabels[alg].deprecated" class="nb-tag" style="background:var(--warning)">⚠ 已不推荐用于安全场景</span>
            <span class="nb-tag cyan">{{ hash.length }} hex 字符</span>
          </div>
          <pre class="hash-value">{{ hash }}</pre>
          <div class="hash-actions">
            <button class="nb-btn sm" @click="copyHash(hash)">📋 复制</button>
            <button class="nb-btn sm" @click="downloadHash(alg, hash)">⬇ 下载</button>
          </div>
        </div>
      </div>
    </div>

    <div class="nb-card mt-16">
      <h3 class="nb-h3">💡 说明</h3>
      <div class="hint mt-16">
        <p><strong>MD5</strong>: 128位哈希，已被攻破，不应用于安全场景，仅做校验</p>
        <p><strong>SHA-1</strong>: 160位哈希，已被攻破，不应用于安全场景</p>
        <p><strong>SHA-256</strong>: 256位哈希，推荐用于密码学和完整性校验</p>
        <p><strong>SHA-512</strong>: 512位哈希，更高安全级别</p>
        <p>⚡ SHA-* 使用浏览器原生 Web Crypto API，性能最佳</p>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.toolbar-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.stats { display: flex; gap: 6px; flex-wrap: wrap; }
.hash-list { display: flex; flex-direction: column; gap: 12px; }
.hash-item {
  background: var(--paper-bg);
  border: 3px solid var(--ink);
  padding: 12px;
}
.hash-header {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.hash-value {
  background: var(--ink);
  color: var(--neon);
  padding: 10px;
  border: 2px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
  word-break: break-all;
  margin: 8px 0;
  white-space: pre-wrap;
}
.hash-actions { display: flex; gap: 6px; }
.hint {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-soft);
  background: var(--paper-bg);
  padding: 12px;
  border-left: 3px solid var(--accent);
}
.hint p { margin: 2px 0; }
</style>
