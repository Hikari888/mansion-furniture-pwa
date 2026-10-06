/**
 * キャンバス描画エンジン
 * 図面・スケールグリッド・窓/ドア開閉軌道・家具・リアルタイム干渉ハイライトを描画
 */

import { CollisionEngine } from '../math/collision.js';

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // ビューポート (パン・ズーム)
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    // レンダリング状態
    this.planImage = null; // HTMLImageElement
    this.project = null;
    this.selectedItem = null; // { type: 'furniture'|'attribute', id: string }
    this.interferences = new Map(); // instanceId -> { door: boolean, window: boolean, wall: boolean }

    // インタラクション用一時状態
    this.calibrationLine = null; // { p1: {x,y}, p2: {x,y} }
    this.perspectiveCorners = null; // [{x,y}, {x,y}, {x,y}, {x,y}]
    this.activeCornerIndex = -1;
  }

  setPlanImage(img) {
    this.planImage = img;
  }

  setProject(project) {
    this.project = project;
  }

  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.scale(dpr, dpr);
    this.cssWidth = width;
    this.cssHeight = height;
  }

  // キャンバス座標 <-> スクリーン座標変換
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.panX) / this.zoom,
      y: (sy - this.panY) / this.zoom
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoom + this.panX,
      y: wy * this.zoom + this.panY
    };
  }

  resetView(contentWidth, contentHeight) {
    if (!contentWidth || !contentHeight) return;
    const padding = 40;
    const scaleX = (this.cssWidth - padding * 2) / contentWidth;
    const scaleY = (this.cssHeight - padding * 2) / contentHeight;
    this.zoom = Math.min(scaleX, scaleY, 1.5);
    this.panX = (this.cssWidth - contentWidth * this.zoom) / 2;
    this.panY = (this.cssHeight - contentHeight * this.zoom) / 2;
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    // 背景クリア
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);

    // ビューポート変換適用
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // 1. 図面描画
    if (this.planImage) {
      ctx.drawImage(this.planImage, 0, 0);
    }

    // 2. スケールグリッド描画（pxPerCmが存在する場合）
    if (this.project?.scale?.pxPerCm) {
      this.drawScaleGrid(ctx);
    }

    // 3. 部屋境界壁 (Room Boundary)
    if (this.project?.roomBoundary && this.project.roomBoundary.length > 2) {
      this.drawRoomBoundary(ctx);
    }

    // 4. 窓 & ドア（開閉軌道）描画
    if (this.project?.attributes) {
      this.drawAttributes(ctx);
    }

    // 5. 配置家具の描画
    if (this.project) {
      this.drawPlacedFurniture(ctx);
    }

    // 6. キャリブレーション測定線描画
    if (this.calibrationLine) {
      this.drawCalibrationLine(ctx);
    }

    // 7. パース補正ピン描画
    if (this.perspectiveCorners) {
      this.drawPerspectiveCorners(ctx);
    }

    ctx.restore();

    // 8. 画面固定HUD (右下スケール定規など)
    this.drawHUD();
  }

  /**
   * 実寸スケールに基づく50cm/1mグリッド描画
   */
  drawScaleGrid(ctx) {
    const pxPerCm = this.project.scale.pxPerCm;
    const meterPx = pxPerCm * 100;
    const halfMeterPx = pxPerCm * 50;

    const w = this.planImage ? this.planImage.width : 2000;
    const h = this.planImage ? this.planImage.height : 2000;

    ctx.save();
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.08)';
    ctx.lineWidth = 1 / this.zoom;

    // 50cmグリッド
    for (let x = 0; x < w; x += halfMeterPx) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += halfMeterPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 1m グリッド
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.18)';
    for (let x = 0; x < w; x += meterPx) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += meterPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 部屋境界壁
   */
  drawRoomBoundary(ctx) {
    const pts = this.project.roomBoundary;
    ctx.save();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4 / this.zoom;
    ctx.setLineDash([8 / this.zoom, 4 / this.zoom]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 属性（窓、ドア）の描画
   */
  drawAttributes(ctx) {
    const pxPerCm = this.project?.scale?.pxPerCm || 1.5;

    for (const attr of this.project.attributes) {
      const isSelected = this.selectedItem?.id === attr.id;
      const widthPx = attr.widthCm * pxPerCm;

      ctx.save();
      ctx.translate(attr.x, attr.y);
      ctx.rotate((attr.rotation * Math.PI) / 180);

      if (attr.type === 'door') {
        // 開き戸
        const doorDepthPx = 6;
        const hingeX = 0;
        const hingeY = 0;
        const radius = widthPx;

        // 開き方向の角度計算 (90度扇形)
        const swingSign = attr.doorHinge === 'left' ? 1 : -1;
        const startAngle = 0;
        const endAngle = swingSign * (Math.PI / 2);

        // 扇形開閉軌道 (薄い赤/オレンジの領域)
        ctx.fillStyle = isSelected ? 'rgba(239, 68, 68, 0.25)' : 'rgba(249, 115, 22, 0.18)';
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.5 / this.zoom;
        ctx.beginPath();
        ctx.moveTo(hingeX, hingeY);
        ctx.arc(hingeX, hingeY, radius, Math.min(startAngle, endAngle), Math.max(startAngle, endAngle));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ドア本体の線
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 4 / this.zoom;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(widthPx, 0);
        ctx.stroke();

        // 吊元マーカー
        ctx.fillStyle = '#c2410c';
        ctx.beginPath();
        ctx.arc(0, 0, 5 / this.zoom, 0, Math.PI * 2);
        ctx.fill();

        // ドアラベル & 寸法
        ctx.fillStyle = '#9a3412';
        ctx.font = `bold ${Math.max(11, 13 / this.zoom)}px sans-serif`;
        ctx.fillText(`🚪 ドア (${attr.widthCm}cm)`, 10, -8 / this.zoom);

      } else if (attr.type === 'window') {
        // 窓
        const depthPx = 14;
        ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.45)' : 'rgba(56, 189, 248, 0.25)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2 / this.zoom;

        // 窓矩形
        ctx.fillRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);
        ctx.strokeRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);

        // サッシスリット線
        ctx.beginPath();
        ctx.moveTo(-widthPx / 2, 0);
        ctx.lineTo(widthPx / 2, 0);
        ctx.stroke();

        // ラベル
        ctx.fillStyle = '#0369a1';
        ctx.font = `bold ${Math.max(11, 13 / this.zoom)}px sans-serif`;
        ctx.fillText(`🪟 窓 (${attr.widthCm}cm)`, -widthPx / 2 + 5, -depthPx / 2 - 5 / this.zoom);
      }

      // 選択中インジケータ
      if (isSelected) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2 / this.zoom;
        ctx.setLineDash([4 / this.zoom, 4 / this.zoom]);
        ctx.strokeRect(-widthPx / 2 - 8, -25, widthPx + 16, 50);
      }

      ctx.restore();
    }
  }

  /**
   * 配置済み家具の描画 & 干渉警告
   */
  drawPlacedFurniture(ctx) {
    const currentLayout = this.project.layouts?.find((l) => l.id === this.project.currentLayoutId);
    if (!currentLayout || !currentLayout.items) return;

    const pxPerCm = this.project?.scale?.pxPerCm || 1.5;

    for (const item of currentLayout.items) {
      // 家具定義を取得
      const meta = this.getFurnitureMeta(item.furnitureId);
      if (!meta) continue;

      const wPx = meta.widthCm * pxPerCm;
      const hPx = meta.depthCm * pxPerCm;
      const isSelected = this.selectedItem?.id === item.instanceId;

      // 干渉状態チェック
      const interf = this.interferences.get(item.instanceId) || {};

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate((item.rotation * Math.PI) / 180);

      // 家具本体の塗り
      ctx.fillStyle = meta.color || '#6366f1';
      ctx.strokeStyle = '#1e1b4b';
      ctx.lineWidth = 2 / this.zoom;

      // 干渉時の色変化
      if (interf.door) {
        // ドア干渉: 赤い強調
        ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.strokeStyle = '#b91c1c';
        ctx.lineWidth = 3 / this.zoom;
      } else if (interf.window) {
        // 窓干渉: 黄色の強調
        ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 3 / this.zoom;
      }

      // 角丸四角形
      this.drawRoundedRect(ctx, -wPx / 2, -hPx / 2, wPx, hPx, 6);
      ctx.fill();
      ctx.stroke();

      // 内部テクスチャ（ベッドやソファの頭部・ピローマーク）
      this.drawFurnitureDetails(ctx, meta, wPx, hPx);

      // 名称 & 実寸ラベル
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(11, 13 / this.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 3;
      ctx.fillText(meta.name, 0, -8);

      ctx.font = `${Math.max(9, 11 / this.zoom)}px sans-serif`;
      ctx.fillText(`${meta.widthCm}×${meta.depthCm}cm`, 0, 10);
      ctx.shadowBlur = 0;

      // 干渉警告バッジ描画
      if (interf.door) {
        this.drawWarningBadge(ctx, 0, -hPx / 2 - 14 / this.zoom, '⛔ ドア開閉に干渉！', '#ef4444');
      } else if (interf.window) {
        this.drawWarningBadge(ctx, 0, -hPx / 2 - 14 / this.zoom, '⚠️ 窓が隠れます', '#f59e0b');
      }

      // 選択中ハイライト & 回転ハンドル
      if (isSelected) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2 / this.zoom;
        ctx.setLineDash([4 / this.zoom, 4 / this.zoom]);
        this.drawRoundedRect(ctx, -wPx / 2 - 6, -hPx / 2 - 6, wPx + 12, hPx + 12, 8);
        ctx.stroke();
        ctx.setLineDash([]);

        // 回転ハンドル (上部)
        const handleDist = hPx / 2 + 25 / this.zoom;
        ctx.beginPath();
        ctx.moveTo(0, -hPx / 2 - 6);
        ctx.lineTo(0, -handleDist);
        ctx.strokeStyle = '#2563eb';
        ctx.stroke();

        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(0, -handleDist, 8 / this.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(9, 10 / this.zoom)}px sans-serif`;
        ctx.fillText('↻', 0, -handleDist);
      }

      ctx.restore();
    }
  }

  /**
   * 警告バッジ
   */
  drawWarningBadge(ctx, x, y, text, bgColor) {
    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.font = `bold ${Math.max(10, 12 / this.zoom)}px sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const pad = 6 / this.zoom;
    const badgeW = textWidth + pad * 2;
    const badgeH = 18 / this.zoom;

    this.drawRoundedRect(ctx, x - badgeW / 2, y - badgeH / 2, badgeW, badgeH, 4);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawFurnitureDetails(ctx, meta, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5 / this.zoom;

    if (meta.category === '寝室') {
      // 枕
      const pillowW = w * 0.7;
      const pillowH = h * 0.2;
      this.drawRoundedRect(ctx, -pillowW / 2, -h / 2 + 6, pillowW, pillowH, 4);
      ctx.stroke();
    } else if (meta.category === 'リビング' && meta.name.includes('ソファ')) {
      // 背もたれ
      const backH = h * 0.25;
      ctx.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, backH);
    }
    ctx.restore();
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * キャリブレーション測定線
   */
  drawCalibrationLine(ctx) {
    const { p1, p2 } = this.calibrationLine;
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3 / this.zoom;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // 端点ピン
    for (const p of [p1, p2]) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8 / this.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 / this.zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    // 長さラベル
    const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    ctx.fillStyle = '#dc2626';
    ctx.font = `bold ${Math.max(12, 14 / this.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`基準寸法線 (${Math.round(distPx)}px)`, midX, midY - 12 / this.zoom);

    ctx.restore();
  }

  /**
   * パース補正用の4隅ピン
   */
  drawPerspectiveCorners(ctx) {
    const corners = this.perspectiveCorners;
    if (!corners || corners.length !== 4) return;

    ctx.save();
    // 4角を結ぶライン
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5 / this.zoom;
    ctx.fillStyle = 'rgba(2, 132, 199, 0.15)';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4つの頂点ピン
    const labels = ['左上 (TL)', '右上 (TR)', '右下 (BR)', '左下 (BL)'];
    corners.forEach((p, idx) => {
      const isDragging = this.activeCornerIndex === idx;
      ctx.fillStyle = isDragging ? '#f59e0b' : '#0284c7';
      ctx.beginPath();
      ctx.arc(p.x, p.y, (isDragging ? 14 : 11) / this.zoom, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 / this.zoom, 0, Math.PI * 2);
      ctx.fill();

      // ラベル
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${Math.max(11, 13 / this.zoom)}px sans-serif`;
      ctx.fillText(labels[idx], p.x + 15 / this.zoom, p.y + 4 / this.zoom);
    });

    ctx.restore();
  }

  /**
   * HUD (画面固定要素: 右下のスケールバー等)
   */
  drawHUD() {
    if (!this.project?.scale?.pxPerCm) return;
    const ctx = this.ctx;
    const pxPerCm = this.project.scale.pxPerCm;
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1m のスクリーン上の長さ
    const oneMeterScreenPx = pxPerCm * 100 * this.zoom;
    const x = this.cssWidth - oneMeterScreenPx - 24;
    const y = this.cssHeight - 34;

    if (oneMeterScreenPx > 20 && oneMeterScreenPx < 400) {
      // スケールバー背景
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      this.drawRoundedRect(ctx, x - 10, y - 18, oneMeterScreenPx + 20, 26, 6);
      ctx.fill();
      ctx.stroke();

      // スケールバー本体
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + oneMeterScreenPx, y);
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
      ctx.moveTo(x + oneMeterScreenPx, y - 4);
      ctx.lineTo(x + oneMeterScreenPx, y + 4);
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('1.0 m (100cm)', x + oneMeterScreenPx / 2, y - 6);
    }

    ctx.restore();
  }

  getFurnitureMeta(id) {
    const preset = window.PRESET_MAP?.get(id);
    if (preset) return preset;
    return this.project?.customFurniture?.find((f) => f.id === id);
  }
}
