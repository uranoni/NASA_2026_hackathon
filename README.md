# NASA 2026 EVA Telemetry HUD

太空人即時生理數據 3D 監控儀表板（React + Three.js / R3F）。

## 開發

```bash
npm install
npm run dev
```

瀏覽：http://127.0.0.1:5173/

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
