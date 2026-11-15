// 免安裝版本的模組載入器（給 cdn.html 用）
// 從 src/main.tsx 開始，逐一抓取本地 .ts／.tsx，用瀏覽器內的 Babel 轉成 JavaScript，
// 把相對路徑的 import 換成轉譯後的 blob URL；套件（react、three…）交給 cdn.html 的 importmap 解析。
// CSS：含 @import "tailwindcss" 的交給 Tailwind 瀏覽器版處理，其餘直接插入 <style>。

const EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js']
const cache = new Map() // 模組絕對路徑（不含副檔名）→ Promise<blob URL>
const RELATIVE = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g

async function fetchSource(base) {
  for (const ext of EXTS) {
    const url = base + ext
    const res = await fetch(url, { cache: 'no-store' })
    const type = res.headers.get('content-type') || ''
    if (res.ok && !type.includes('text/html')) return { url, text: await res.text() }
  }
  throw new Error('找不到模組：' + base)
}

function injectCss(css, url) {
  const style = document.createElement('style')
  if (/@import\s+["']tailwindcss["']/.test(css)) style.type = 'text/tailwindcss'
  style.dataset.source = url
  style.textContent = css
  document.head.appendChild(style)
}

function load(base) {
  if (cache.has(base)) return cache.get(base)
  const job = (async () => {
    if (base.endsWith('.css')) {
      injectCss(await (await fetch(base, { cache: 'no-store' })).text(), base)
      return 'data:text/javascript,'
    }
    const { url, text } = await fetchSource(base)
    const isTS = /\.tsx?$/.test(url)
    const out = window.Babel.transform(text, {
      filename: url,
      sourceType: 'module',
      presets: [
        ...(isTS ? [['typescript', { isTSX: url.endsWith('.tsx'), allExtensions: true }]] : []),
        ['react', { runtime: 'automatic' }],
      ],
      sourceMaps: 'inline',
      comments: false, // 註解裡的 import 範例不能被當成相依
    }).code
    const deps = {}
    for (const m of out.matchAll(RELATIVE)) {
      const spec = m[3]
      const target = new URL(spec, url).href
      if (target === base || target === url) continue // 防止模組載入自己而卡住
      if (!(spec in deps)) deps[spec] = await load(target)
    }
    const code = out.replace(RELATIVE, (all, pre, q, spec) => `${pre}${q}${deps[spec]}${q}`)
    return URL.createObjectURL(new Blob([code + `\n//# sourceURL=${url}`], { type: 'text/javascript' }))
  })()
  cache.set(base, job)
  return job
}

function showError(err) {
  console.error(err)
  const box = document.getElementById('cdn-loading')
  if (box) {
    box.style.color = '#ff6b81'
    box.textContent = '載入失敗：' + (err && err.message ? err.message : err)
  }
}

try {
  // 相對於頁面網址，GitHub Pages 的子路徑（/NASA_2026_hackathon/）也能用
  const entry = await load(new URL('src/main.tsx', document.baseURI).href)
  await import(entry)
  document.getElementById('cdn-loading')?.remove()
} catch (err) {
  showError(err)
}
