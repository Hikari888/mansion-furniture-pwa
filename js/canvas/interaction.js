/**
 * タッチ & マウス インタラクションマネージャー
 * - シングルタッチ/マウスクリック: 選択、家具移動、回転ハンドル操作
 * - マルチタッチ: ピンチズーム & パン
 * - ドラッグ中のリアルタイム衝突・干渉判定
 */

import { CollisionEngine } from '../math/collision.js';

export class CanvasInteraction {
  constructor(renderer, app) {
    this.renderer = renderer;
    this.app = app;
    this.canvas = renderer.canvas;

    this.mode = 'furniture'; // 'furniture' | 'perspective' | 'calibrate' | 'attribute'
    this.dragTarget = null; // { type: 'furniture'|'attribute'|'corner'|'pan'|'rotate', id, offset, ... }
    this.pointers = new Map(); // id -> { x, y }
    this.lastPinchDist = null;

    this.initEvents();
  }

  setMode(mode) {
    this.mode = mode;
    this.dragTarget = null;
  }

  initEvents() {
    const c = this.canvas;
    c.style.touchAction = 'none'; // ブラウザ標準スクロールを抑制

    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    c.addEventListener('pointermove', (e) => this.onPointerMove(e));
    c.addEventListener('pointerup', (e) => this.onPointerUp(e));
    c.addEventListener('pointercancel', (e) => this.onPointerUp(e));

    // マウスホイールズーム
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoomAt(sx, sy, factor);
    }, { passive: false });
  }

  zoomAt(sx, sy, factor) {
    const r = this.renderer;
    const oldZoom = r.zoom;
    const newZoom = Math.max(0.2, Math.min(5, oldZoom * factor));

    const world = r.screenToWorld(sx, sy);
    r.zoom = newZoom;
    r.panX = sx - world.x * newZoom;
    r.panY = sy - world.y * newZoom;
    r.render();
  }

  onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.renderer.screenToWorld(sx, sy);

    this.pointers.set(e.pointerId, { sx, sy });

    // 2本指以上ならピンチ/パン優先
    if (this.pointers.size === 2) {
      const pts = Array.from(this.pointers.values());
      this.lastPinchDist = Math.hypot(pts[0].sx - pts[1].sx, pts[0].sy - pts[1].sy);
      this.dragTarget = { type: 'pinch' };
      return;
    }

    // モードごとのヒットテスト
    if (this.mode === 'perspective') {
      const corners = this.renderer.perspectiveCorners;
      if (corners) {
        for (let i = 0; i < 4; i++) {
          const dist = Math.hypot(world.x - corners[i].x, world.y - corners[i].y);
          if (dist <= 30 / this.renderer.zoom) {
            this.dragTarget = { type: 'corner', index: i };
            this.renderer.activeCornerIndex = i;
            this.renderer.render();
            return;
          }
        }
      }
      // ピン以外なら背景パン
      this.dragTarget = { type: 'pan', startSx: sx, startSy: sy, startPanX: this.renderer.panX, startPanY: this.renderer.panY };
      return;
    }

    if (this.mode === 'calibrate') {
      // キャリブレーション開始 (2点指定)
      if (!this.renderer.calibrationLine) {
        this.renderer.calibrationLine = { p1: { ...world }, p2: { ...world } };
        this.dragTarget = { type: 'calibrate_p2' };
      } else {
        // 既存ピンのドラッグ
        const { p1, p2 } = this.renderer.calibrationLine;
        const d1 = Math.hypot(world.x - p1.x, world.y - p1.y);
        const d2 = Math.hypot(world.x - p2.x, world.y - p2.y);
        if (d1 <= 25 / this.renderer.zoom) {
          this.dragTarget = { type: 'calibrate_p1' };
        } else if (d2 <= 25 / this.renderer.zoom) {
          this.dragTarget = { type: 'calibrate_p2' };
        } else {
          this.renderer.calibrationLine = { p1: { ...world }, p2: { ...world } };
          this.dragTarget = { type: 'calibrate_p2' };
        }
      }
      this.renderer.render();
      return;
    }

    if (this.mode === 'furniture' || this.mode === 'attribute') {
      // 1. 選択中の家具の回転ハンドルか？
      if (this.renderer.selectedItem?.type === 'furniture') {
        const item = this.getPlacedFurniture(this.renderer.selectedItem.id);
        if (item) {
          const meta = this.renderer.getFurnitureMeta(item.furnitureId);
          const pxPerCm = this.renderer.project?.scale?.pxPerCm || 1.5;
          const hPx = (meta?.depthCm || 100) * pxPerCm;
          const handleDist = hPx / 2 + 25 / this.renderer.zoom;

          // 回転ハンドルのワールド座標
          const rad = (item.rotation * Math.PI) / 180;
          const handleWorldX = item.x + Math.sin(rad) * handleDist;
          const handleWorldY = item.y - Math.cos(rad) * handleDist;

          const dist = Math.hypot(world.x - handleWorldX, world.y - handleWorldY);
          if (dist <= 22 / this.renderer.zoom) {
            this.dragTarget = { type: 'rotate', item, startAngle: item.rotation };
            return;
          }
        }
      }

      // 2. 家具のヒットテスト
      const hitFurniture = this.hitTestFurniture(world);
      if (hitFurniture) {
        this.renderer.selectedItem = { type: 'furniture', id: hitFurniture.instanceId };
        this.dragTarget = {
          type: 'furniture',
          item: hitFurniture,
          offsetX: world.x - hitFurniture.x,
          offsetY: world.y - hitFurniture.y
        };
        this.app.onSelectionChange('furniture', hitFurniture);
        this.renderer.render();
        return;
      }

      // 3. 窓・ドア（属性）のヒットテスト
      const hitAttr = this.hitTestAttribute(world);
      if (hitAttr) {
        this.renderer.selectedItem = { type: 'attribute', id: hitAttr.id };
        this.dragTarget = {
          type: 'attribute',
          attr: hitAttr,
          offsetX: world.x - hitAttr.x,
          offsetY: world.y - hitAttr.y
        };
        this.app.onSelectionChange('attribute', hitAttr);
        this.renderer.render();
        return;
      }

      // 何もヒットしない場合 => 選択解除 & 背景パン
      this.renderer.selectedItem = null;
      this.app.onSelectionChange(null, null);
      this.dragTarget = {
        type: 'pan',
        startSx: sx,
        startSy: sy,
        startPanX: this.renderer.panX,
        startPanY: this.renderer.panY
      };
      this.renderer.render();
    }
  }

  onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.renderer.screenToWorld(sx, sy);

    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { sx, sy });
    }

    // ピンチズーム
    if (this.pointers.size === 2 && this.dragTarget?.type === 'pinch') {
      const pts = Array.from(this.pointers.values());
      const dist = Math.hypot(pts[0].sx - pts[1].sx, pts[0].sy - pts[1].sy);
      if (this.lastPinchDist) {
        const factor = dist / this.lastPinchDist;
        const midSx = (pts[0].sx + pts[1].sx) / 2;
        const midSy = (pts[0].sy + pts[1].sy) / 2;
        this.zoomAt(midSx, midSy, factor);
      }
      this.lastPinchDist = dist;
      return;
    }

    if (!this.dragTarget) return;

    if (this.dragTarget.type === 'pan') {
      const dx = sx - this.dragTarget.startSx;
      const dy = sy - this.dragTarget.startSy;
      this.renderer.panX = this.dragTarget.startPanX + dx;
      this.renderer.panY = this.dragTarget.startPanY + dy;
      this.renderer.render();
      return;
    }

    if (this.dragTarget.type === 'corner') {
      const idx = this.dragTarget.index;
      this.renderer.perspectiveCorners[idx].x = world.x;
      this.renderer.perspectiveCorners[idx].y = world.y;
      this.renderer.render();
      return;
    }

    if (this.dragTarget.type === 'calibrate_p2') {
      this.renderer.calibrationLine.p2.x = world.x;
      this.renderer.calibrationLine.p2.y = world.y;
      this.renderer.render();
      return;
    } else if (this.dragTarget.type === 'calibrate_p1') {
      this.renderer.calibrationLine.p1.x = world.x;
      this.renderer.calibrationLine.p1.y = world.y;
      this.renderer.render();
      return;
    }

    if (this.dragTarget.type === 'rotate') {
      const item = this.dragTarget.item;
      const angleRad = Math.atan2(world.x - item.x, -(world.y - item.y));
      let deg = Math.round((angleRad * 180) / Math.PI);
      if (deg < 0) deg += 360;
      // 15度刻みスナップ
      if (Math.abs(deg % 15) < 4) deg = Math.round(deg / 15) * 15;
      item.rotation = deg;
      this.app.checkInterferences();
      this.renderer.render();
      return;
    }

    if (this.dragTarget.type === 'furniture') {
      const item = this.dragTarget.item;
      let newX = world.x - this.dragTarget.offsetX;
      let newY = world.y - this.dragTarget.offsetY;

      // 壁面衝突・部屋境界の制限（壁の外へはみ出しブロック）
      const meta = this.renderer.getFurnitureMeta(item.furnitureId);
      const pxPerCm = this.renderer.project?.scale?.pxPerCm || 1.5;
      const wPx = (meta?.widthCm || 100) * pxPerCm;
      const hPx = (meta?.depthCm || 100) * pxPerCm;

      // 部屋境界ポリゴンが存在する場合
      if (this.renderer.project?.roomBoundary?.length > 2) {
        const poly = this.renderer.project.roomBoundary;
        const corners = CollisionEngine.getBoxCorners({ x: newX, y: newY }, wPx, hPx, item.rotation);
        // 4頂点すべてが部屋ポリゴン内にあるか
        const allInside = corners.every((c) => CollisionEngine.isPointInPolygon(c, poly));
        if (allInside) {
          item.x = newX;
          item.y = newY;
        } else {
          // はみ出す場合は移動を制限（ブロック）
        }
      } else {
        // 境界未定義時は自由移動
        item.x = newX;
        item.y = newY;
      }

      // リアルタイム干渉判定
      this.app.checkInterferences();
      this.renderer.render();
      return;
    }

    if (this.dragTarget.type === 'attribute') {
      const attr = this.dragTarget.attr;
      attr.x = world.x - this.dragTarget.offsetX;
      attr.y = world.y - this.dragTarget.offsetY;
      this.app.checkInterferences();
      this.renderer.render();
      return;
    }
  }

  onPointerUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.lastPinchDist = null;
    }
    if (this.dragTarget?.type === 'corner') {
      this.renderer.activeCornerIndex = -1;
      this.renderer.render();
    }
    if (this.dragTarget?.type === 'furniture' || this.dragTarget?.type === 'rotate') {
      this.app.saveCurrentProject();
    }
    this.dragTarget = null;
  }

  hitTestFurniture(world) {
    const currentLayout = this.renderer.project?.layouts?.find(
      (l) => l.id === this.renderer.project.currentLayoutId
    );
    if (!currentLayout || !currentLayout.items) return null;

    const pxPerCm = this.renderer.project?.scale?.pxPerCm || 1.5;
    // 指タップ用のマージン (スマホの指の太さを考慮)
    const touchMarginPx = 16 / this.renderer.zoom;

    // 上にあるもの（配列の後ろ）から優先ヒット
    for (let i = currentLayout.items.length - 1; i >= 0; i--) {
      const item = currentLayout.items[i];
      const meta = this.renderer.getFurnitureMeta(item.furnitureId);
      if (!meta) continue;

      const wPx = meta.widthCm * pxPerCm + touchMarginPx * 2;
      const hPx = meta.depthCm * pxPerCm + touchMarginPx * 2;
      const corners = CollisionEngine.getBoxCorners(item, wPx, hPx, item.rotation);

      if (CollisionEngine.isPointInPolygon(world, corners)) {
        return item;
      }
    }
    return null;
  }

  hitTestAttribute(world) {
    if (!this.renderer.project?.attributes) return null;
    const pxPerCm = this.renderer.project?.scale?.pxPerCm || 1.5;
    const touchMarginPx = 16 / this.renderer.zoom;

    for (let i = this.renderer.project.attributes.length - 1; i >= 0; i--) {
      const attr = this.renderer.project.attributes[i];
      const wPx = attr.widthCm * pxPerCm + touchMarginPx * 2;
      const hPx = 36 / this.renderer.zoom; // タッチターゲット高さ
      const corners = CollisionEngine.getBoxCorners(attr, wPx, hPx, attr.rotation);

      if (CollisionEngine.isPointInPolygon(world, corners)) {
        return attr;
      }
    }
    return null;
  }

  getPlacedFurniture(instanceId) {
    const layout = this.renderer.project?.layouts?.find(
      (l) => l.id === this.renderer.project.currentLayoutId
    );
    return layout?.items?.find((i) => i.instanceId === instanceId);
  }
}
