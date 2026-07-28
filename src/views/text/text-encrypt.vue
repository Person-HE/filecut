<script setup>
/**
 * 文本加密解密 - AES、DES、Base64、URL编码、Hex
 * 用 crypto-js
 * 加密/解密双向
 */
import { ref, computed } from 'vue'
import CryptoJS from 'crypto-js'
import ToolLayout from '../../components/ToolLayout.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const input = ref('')
const output = ref('')
const password = ref('')
const algorithm = ref('aes')  // aes / des / tripleDes / base64 / url / hex
const mode = ref('encrypt')   // encrypt / decrypt
const result = ref([])
const error = ref('')
const encoding = ref('utf8')  // utf8 / base64

const algorithms = [
  { value: 'aes', label: 'AES (推荐)', needKey: true },
  { value: 'des', label: 'DES', needKey: true },
  { value: 'tripledes', label: 'Triple DES', needKey: true },
  { value: 'rabbit', label: 'Rabbit', needKey: true },
  { value: 'base64', label: 'Base64', needKey: false },
  { value: 'url', label: 'URL 编码', needKey: false },
  { value: 'hex', label: 'Hex (十六进制)', needKey: false },
  { value: 'md5', label: 'MD5 (单向)', needKey: false },
  { value: 'sha1', label: 'SHA1 (单向)', needKey: false },
  { value: 'sha256', label: 'SHA256 (单向)', needKey: false }
]

const needsPassword = computed(() => {
  const a = algorithms.find(x => x.value === algorithm.value)
  return a && a.needKey
})

const isOneWay = computed(() => ['md5', 'sha1', 'sha256'].includes(algorithm.value))

async function process() {
  if (!input.value) {
    showError('请输入文本')
    return
  }
  if (needsPassword.value && !password.value) {
    showError('请输入密钥')
    return
  }
  error.value = ''
  output.value = ''
  result.value = []

  await safeRun(async () => {
    let text
    const alg = algorithm.value
    const pwd = password.value

    if (alg === 'aes') {
      if (mode.value === 'encrypt') {
        text = CryptoJS.AES.encrypt(input.value, pwd).toString()
      } else {
        const bytes = CryptoJS.AES.decrypt(input.value, pwd)
        text = bytes.toString(CryptoJS.enc.Utf8)
        if (!text) throw new Error('解密失败：密钥错误或数据损坏')
      }
    } else if (alg === 'des') {
      if (mode.value === 'encrypt') {
        text = CryptoJS.DES.encrypt(input.value, pwd).toString()
      } else {
        const bytes = CryptoJS.DES.decrypt(input.value, pwd)
        text = bytes.toString(CryptoJS.enc.Utf8)
        if (!text) throw new Error('解密失败')
      }
    } else if (alg === 'tripledes') {
      if (mode.value === 'encrypt') {
        text = CryptoJS.TripleDES.encrypt(input.value, pwd).toString()
      } else {
        const bytes = CryptoJS.TripleDES.decrypt(input.value, pwd)
        text = bytes.toString(CryptoJS.enc.Utf8)
        if (!text) throw new Error('解密失败')
      }
    } else if (alg === 'rabbit') {
      if (mode.value === 'encrypt') {
        text = CryptoJS.Rabbit.encrypt(input.value, pwd).toString()
      } else {
        const bytes = CryptoJS.Rabbit.decrypt(input.value, pwd)
        text = bytes.toString(CryptoJS.enc.Utf8)
        if (!text) throw new Error('解密失败')
      }
    } else if (alg === 'base64') {
      if (mode.value === 'encrypt') {
        text = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(input.value))
      } else {
        const bytes = CryptoJS.enc.Base64.parse(input.value)
        text = bytes.toString(CryptoJS.enc.Utf8)
        if (!text) throw new Error('Base64 解码失败')
      }
    } else if (alg === 'url') {
      if (mode.value === 'encrypt') {
        text = encodeURIComponent(input.value)
      } else {
        text = decodeURIComponent(input.value)
      }
    } else if (alg === 'hex') {
      if (mode.value === 'encrypt') {
        text = CryptoJS.enc.Hex.stringify(CryptoJS.enc.Utf8.parse(input.value))
      } else {
        const bytes = CryptoJS.enc.Hex.parse(input.value)
        text = bytes.toString(CryptoJS.enc.Utf8)
        if (!text) throw new Error('Hex 解码失败')
      }
    } else if (alg === 'md5') {
      text = CryptoJS.MD5(input.value).toString()
    } else if (alg === 'sha1') {
      text = CryptoJS.SHA1(input.value).toString()
    } else if (alg === 'sha256') {
      text = CryptoJS.SHA256(input.value).toString()
    }

    if (text === undefined || text === null) throw new Error('处理结果为空')
    output.value = text

    // 创建下载
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const ext = isOneWay.value ? '.txt' : (mode.value === 'encrypt' ? '.enc' : '.dec')
    result.value = [{ name: `output${ext}`, blob, url, size: blob.size }]
  }, '加密/解密失败')
}

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
    .then(() => showError('已复制'))
    .catch(() => showError('复制失败'))
}

function clearAll() {
  input.value = ''
  output.value = ''
  result.value = []
  error.value = ''
}

function swapMode() {
  if (isOneWay.value) return
  mode.value = mode.value === 'encrypt' ? 'decrypt' : 'encrypt'
  if (output.value) {
    input.value = output.value
    output.value = ''
    result.value = []
  }
}

const inputStats = computed(() => {
  if (!input.value) return null
  return {
    chars: input.value.length,
    bytes: new Blob([input.value]).size
  }
})
</script>

<template>
  <ToolLayout title="文本加密解密" desc="支持AES/DES/Base64/URL/Hex/MD5/SHA等加密算法" icon="⚿">
    <div class="nb-card">
      <div class="opt-grid">
        <div>
          <label class="nb-label">算法</label>
          <select v-model="algorithm" class="nb-select">
            <option v-for="a in algorithms" :key="a.value" :value="a.value">{{ a.label }}</option>
          </select>
        </div>
        <div v-if="!isOneWay">
          <label class="nb-label">模式</label>
          <select v-model="mode" class="nb-select">
            <option value="encrypt">加密</option>
            <option value="decrypt">解密</option>
          </select>
        </div>
        <div v-if="needsPassword">
          <label class="nb-label">密钥</label>
          <input v-model="password" type="password" class="nb-input" placeholder="输入密钥" />
        </div>
        <div v-if="!isOneWay" class="actions-cell">
          <button class="nb-btn sm" @click="swapMode">⇄ 交换</button>
        </div>
      </div>

      <div class="mt-16">
        <label class="nb-label">
          输入文本
          <span v-if="inputStats" class="meta"> · {{ inputStats.chars }} 字符 / {{ inputStats.bytes }} 字节</span>
        </label>
        <textarea v-model="input" class="nb-textarea" rows="6"
                  :placeholder="mode === 'encrypt' ? '输入要加密的文本...' : '输入要解密的密文...'"
                  spellcheck="false"></textarea>
      </div>

      <div class="mt-16">
        <button class="nb-btn primary lg" @click="process">
          {{ isOneWay ? '🔐 计算' : (mode === 'encrypt' ? '🔐 加密' : '🔓 解密') }}
        </button>
        <button class="nb-btn sm" @click="clearAll">✕ 清空</button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="output" class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">✓ 结果</h3>
        <button class="nb-btn sm" @click="copyOutput">📋 复制</button>
      </div>
      <pre class="output-area mt-16">{{ output }}</pre>
    </div>

    <ResultViewer :files="result" />

    <div class="nb-card mt-16">
      <h3 class="nb-h3">💡 算法说明</h3>
      <div class="algo-info mt-16">
        <div><span class="nb-tag accent">AES</span> 对称加密，安全性高，需密钥</div>
        <div><span class="nb-tag accent">DES</span> 对称加密，已过时但兼容性好</div>
        <div><span class="nb-tag cyan">Base64</span> 编码（非加密），可逆，无密钥</div>
        <div><span class="nb-tag cyan">URL</span> URL编码，处理特殊字符</div>
        <div><span class="nb-tag cyan">Hex</span> 十六进制编码</div>
        <div><span class="nb-tag">MD5/SHA</span> 单向哈希，不可逆，用于校验</div>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.opt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  align-items: end;
}
.actions-cell { display: flex; align-items: end; }
.meta { color: var(--ink-soft); font-size: 11px; font-weight: normal; }
.output-area {
  background: var(--ink);
  color: var(--neon);
  padding: 16px;
  border: 3px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
  max-height: 320px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.algo-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
}
.algo-info > div { padding: 8px; background: var(--paper-bg); border: 1px solid var(--ink-soft); }
</style>
