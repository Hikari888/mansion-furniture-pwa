# マドプレ (Mansion Layout PWA)
> **マンションの図面から手持ち家具の配置シミュレーションができるPWA**

買い替えに伴う複数物件の比較時、手持ちの家具がどう収まるかを現地や移動中にすぐ確認できるモバイルファーストのWebアプリケーションです。

---

## 🌟 実装された機能要件一覧

| 大項目 | 実装内容 | 対応ファイル / エンジン |
| :--- | :--- | :--- |
| **1. 図面入力** | スマホの写真・ファイル読込、カメラ直接起動、サンプル図面即時呼出 | `index.html`, [`sample-data.js`](file:///Users/arakihikari/.gemini/antigravity/scratch/mansion-furniture-pwa/js/sample-data.js) |
| **2. パース歪み補正** | 4隅ピン指定によるホモグラフィ透視投影変換（三角形メッシュ変形） | [`perspective.js`](file:///Users/arakihikari/.gemini/antigravity/scratch/mansion-furniture-pwa/js/math/perspective.js) |
| **3. 広さ推定・スケール** | 任意の1箇所（ドア幅80cm等）の実寸指定からpx/cm縮尺とグリッド自動計算 | [`app.js`](file:///Users/arakihikari/.gemini/antigravity/scratch/mansion-furniture-pwa/js/app.js), [`renderer.js`](file:///Users/arakihikari/.gemini/antigravity/scratch/mansion-furniture-pwa/js/canvas/renderer.js) |
| **4. 属性設定** | 開き戸（90°開閉扇形軌道、吊元反転）、窓のタップ＆ドラッグ配置 | [`renderer.js`](file:///Users/arakihikari/.gemini/antigravity/scratch/mansion-furniture-pwa/js/canvas/renderer.js), [`interaction.js`](file:///Users/arakihikari/.gemini/antigravity/scratch/mansion-furniture-pwa/js/canvas/interaction.js) |
| **5. 家具入力** | 豊富な標準プリセット（ベッド各種、ソファ、デスク等）＋カスタム手持ち家具登録 | [`project.js`](file:///Users/arakihikari/.gemini/antigravity/scratch/mansion-furniture-pwa/js/models/project.js) |
| **6. 配置 & 干渉判定** | ドラッグ＆ドロップ、90°回転、壁境界制限、ドア軌道干渉アラート、窓重複アラート | [`collision.js`](file:///Users/arakihikari/.gemini/antigravity/scratch/mansion-furniture-pwa/js/math/collision.js) (SAT & 扇形交差判定) |
| **7. データ保存・比較** | 複数物件のローカル保存、1物件内での「案1 / 案2」の複製・切替・画像保存 | [`project.js`](file:///Users/arakihikari/.gemini/antigravity/scratch/mansion-furniture-pwa/js/models/project.js), LocalStorage |
| **8. 免責事項・PWA** | 現地実測推奨の免責事項常時明示、オフラインService Worker、Manifest | `manifest.json`, `sw.js` |

---

## 🚀 起動方法

### 1. サーバーの起動
プロジェクトディレクトリにて以下のコマンドを実行します：
```bash
node server.js
```
または Python を使用する場合：
```bash
python3 -m http.server 8080
```

### 2. iPhone / スマホでの確認方法

#### ① 今すぐ同じWi-Fi内のiPhone 16で確認する場合
同じWi-Fiに接続したiPhoneのSafariのアドレスバーに以下を入力します：
👉 **http://192.168.10.18:8080**

#### ② 正式なHTTPS URLを発行してPWAインストールする場合（外出先・内覧会場用）
iOS Safari でPWAの「ホーム画面に追加」を完全機能（全画面・オフラインキャッシュ）で動作させるには、**HTTPS URL** が必要です。本アプリは外部依存のない静的Webアプリのため、以下のいずれかで数分で正式URLを発行できます：
- **GitHub Pages（完全無料・永続）**:
  GitHubにリポジトリを作成してプッシュし、Settings → Pages で `main` ブランチを指定するだけで `https://<ユーザー名>.github.io/mansion-furniture-pwa` が発行されます。
- **Vercel / Cloudflare Pages（完全無料・高速）**:
  このフォルダを連携するだけで `https://xxxx.vercel.app` が即座に発行されます。

---

## 💡 操作手順ガイド

1. **家具のシミュレーション**:
   - 図面上の家具をタップすると青い枠が表示され、ドラッグで移動、上の丸いハンドルまたは「↻ 90°回転」で回転できます。
   - **ドアの近くに家具を移動すると「⛔ ドア開閉に干渉しています」と警告が出ます。**
   - **窓の近くに家具を移動すると「⚠️ 窓が隠れます」と警告が出ます。**
2. **手持ち家具の追加**:
   - 右側（スマホでは下部）の「＋ 手持ち家具登録」から、縦横の寸法（cm）とカラーを指定してワンタップで配置できます。
3. **案の比較**:
   - 上部の「案1 / 案2」タブで配置パターンを切り替えたり、「＋ 案追加」「📋 複製」で手軽に別パターンを比較検討できます。
4. **自身の図面の取り込み**:
   - 「① 図面取込」からスマホで撮影したチラシ図面を読み込みます。
   - 「② パース補正」で四隅ピンを合わせれば、斜め撮影の写真も自動で真っ直ぐな平面図へ補正されます。
   - 「③ スケール設定」でドア幅などの実寸を入力すれば、手持ちの家具との縮尺が完全に一致します。
