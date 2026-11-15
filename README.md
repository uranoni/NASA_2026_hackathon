# NASA 2026 Crew Health Monitor

太空人健康監測（React + Three.js / R3F）。**只做「資料進來之後」**：判斷是否正常（含太空修正）、趨勢、警示、行動建議、自動傳回地面；不做量測、沒有手動輸入。

- 監測畫面：`src/components/monitor/MonitoringDashboard.tsx`（預設首頁）
- 資料接收：`src/lib/feed.ts` — 資料以 FHIR R4 Observation 送進來（LOINC 代碼），每類資料的預期送達頻率依 ISS 實際做法（每日紀錄、每月體能評估、不舒服時），該送沒送到會顯示「資料中斷」
- 判斷邏輯：`src/lib/assessment.ts`（門檻都有出處）
- Demo 用示範資料（畫面標示為 demo）；也可以在畫面上「Import FHIR…」匯入 FHIR Bundle
- 舊的 3D HUD 畫面：網址加 `?view=hud`

## 開發

### 免安裝（不需要 Node／npm）

```bash
python serve.py
```

瀏覽：http://127.0.0.1:5174/

`cdn.html` 從 CDN 載入套件（版本與 `package-lock.json` 相同），`src/` 底下的 TypeScript／TSX 由瀏覽器內的 Babel 即時轉譯（`cdn/loader.js`）。改完程式重新整理即可。

### Vite（需要 Node）

```bash
npm install
npm run dev
```

瀏覽：http://127.0.0.1:5173/

> 套件版本要改時，`package.json` 和 `cdn.html` 的 importmap 要一起改。
> 資源路徑請用相對路徑（例如 `models/astronaut-body.glb`，不要 `/models/...`），GitHub Pages 的子路徑才能運作。

## GitHub Pages

推到 `main` 後，`.github/workflows/pages.yml` 會把免安裝版本發佈到 GitHub Pages（只複製檔案，不需要 build）。

第一次使用前，到 Repo **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。

---

## 3D 人體模型來源

本專案使用的真人肌肉解剖模型來自 **Grab3D**，授權為 **CC0 1.0**（公共領域，可商用、無需署名）。

| 項目 | 說明 |
|------|------|
| 模型名稱 | **Human Muscles**（人體淺層肌肉） |
| 供應商 | [Grab3D](https://grab3d.com/) |
| 模型頁面 | https://grab3d.com/models/anatomy/human-muscles/ |
| 本專案檔案 | `public/models/astronaut-body.glb`（使用 **light** 版本） |
| 原始下載 | https://grab3d.com/dl/human-muscles/human-muscles-light.glb |
| 授權 | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |
| 授權全文 | `public/models/LICENSE-human-muscles.txt` |
| 規格 | 約 1.80 m 高；light 版約 30 萬三角形 |

### Origin / AI 揭露（來源方聲明）

依 Grab3D 附帶授權說明：

- Method: **AI-assisted**（含 AI 生成內容）
- 基底網格與貼圖以 AI image-to-3D 工具（**Meshy**）生成，再於 **Blender** 清理、縮放、貼圖與檢查

若展示平台要求揭露 AI 生成資產（例如 Steam），此模型屬 **AI-assisted**。

### 器官模型

同樣來自 Grab3D，授權 CC0 1.0（無需署名）。依各模型附帶的 LICENSE.txt，**都屬 AI-assisted**：用 Meshy 生成，再於 Blender 整理。

| 模型 | 模型頁面 | 本專案檔案（light 版本） | 規格 |
|------|------|------|------|
| Human Heart | https://grab3d.com/models/anatomy/human-heart/ | `public/models/astronaut-heart.glb` | 0.098 × 0.069 × 0.121 m，約 40 萬三角形 |
| Human Lungs | https://grab3d.com/models/anatomy/human-lungs/ | `public/models/astronaut-lungs.glb` | 0.235 × 0.147 × 0.300 m，約 20.5 萬三角形 |
| Human Brain | https://grab3d.com/models/anatomy/human-brain/ | `public/models/astronaut-brain.glb` | 0.138 × 0.170 × 0.155 m，約 40 萬三角形 |

本專案使用的器官檔案已在 Blender 用 Decimate 減面到約 2 萬三角形（各約 0.9 MB），以加快網頁載入。上表的三角形數是原始 light 版的數字。

原始下載：`https://grab3d.com/dl/human-heart/human-heart-light.glb`、`https://grab3d.com/dl/human-lungs/human-lungs-light.glb`、`https://grab3d.com/dl/human-brain/human-brain-light.glb`

> 參考用的 iStock 全息人體圖僅作視覺風格靈感；**未使用** iStock 付費／版權模型本體。
