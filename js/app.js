/**
 * マンション図面・家具シミュレーター メインコントローラー
 * iPhone 16 / 16 Pro 最適化対応
 */

import { CanvasRenderer } from './canvas/renderer.js';
import { CanvasInteraction } from './canvas/interaction.js';
import { PRESET_FURNITURE, DISCLAIMER_TEXT, ProjectStorage } from './models/project.js';
import { generateSampleFloorPlan } from './sample-data.js';
import { PerspectiveWarp } from './math/perspective.js';
import { CollisionEngine } from './math/collision.js';

window.PRESET_MAP = new Map(PRESET_FURNITURE.map((f) => [f.id, f]));

class App {
  constructor() {
    this.canvas = document.getElementById('mainCanvas');
    this.renderer = new CanvasRenderer(this.canvas);
    this.interaction = new CanvasInteraction(this.renderer, this);

    this.projects = [];
    this.currentProject = null;
    this.currentStep = 'furniture';

    // ボトムシート状態 ('collapsed' | 'half' | 'full')
    this.sheetState = 'half';

    this.init();
  }

  async init() {
    this.setupResize();
    this.setupUI();
    this.setupBottomSheet();
    this.loadProjects();

    // 初回プロジェクトが空ならサンプルを投入
    if (this.projects.length === 0) {
      await this.createSampleProject();
    } else {
      const curId = ProjectStorage.getCurrentProjectId();
      const p = this.projects.find((proj) => proj.id === curId) || this.projects[0];
      this.selectProject(p.id);
    }
  }

  setupResize() {
    const container = document.getElementById('canvasContainer');
    const onResize = () => {
      this.renderer.resize(container.clientWidth, container.clientHeight);
      this.renderer.render();
    };
    window.addEventListener('resize', onResize);
    // iOS Safari のオエンテーション変更やバー出し入れにも対応
    window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
    onResize();
  }

  setupBottomSheet() {
    const sheet = document.getElementById('bottomSheet');
    const handle = document.getElementById('sheetHandle');
    if (!sheet || !handle) return;

    // ハンドルタップで 'collapsed' <-> 'half' <-> 'full' をトグル
    handle.addEventListener('click', () => {
      if (this.sheetState === 'half') {
        this.setSheetState('collapsed');
      } else if (this.sheetState === 'collapsed') {
        this.setSheetState('half');
      } else {
        this.setSheetState('half');
      }
    });

    // スワイプジェスチャー簡易検知
    let startY = 0;
    handle.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
      const diff = e.changedTouches[0].clientY - startY;
      if (diff < -30) {
        // 上スワイプ => 拡大
        if (this.sheetState === 'collapsed') this.setSheetState('half');
        else if (this.sheetState === 'half') this.setSheetState('full');
      } else if (diff > 30) {
        // 下スワイプ => 縮小
        if (this.sheetState === 'full') this.setSheetState('half');
        else if (this.sheetState === 'half') this.setSheetState('collapsed');
      }
    }, { passive: true });
  }

  setSheetState(state) {
    this.sheetState = state;
    const sheet = document.getElementById('bottomSheet');
    if (!sheet) return;
    sheet.classList.remove('sheet-collapsed', 'sheet-half', 'sheet-full');
    sheet.classList.add(`sheet-${state}`);

    // キャンバスのリサイズ追従
    setTimeout(() => {
      const container = document.getElementById('canvasContainer');
      this.renderer.resize(container.clientWidth, container.clientHeight);
      this.renderer.render();
    }, 320);
  }

  loadProjects() {
    this.projects = ProjectStorage.loadAll();
    this.renderProjectSelector();
  }

  saveCurrentProject() {
    if (!this.currentProject) return;
    this.currentProject.updatedAt = Date.now();
    const idx = this.projects.findIndex((p) => p.id === this.currentProject.id);
    if (idx >= 0) {
      this.projects[idx] = this.currentProject;
    } else {
      this.projects.push(this.currentProject);
    }
    ProjectStorage.saveAll(this.projects);
    ProjectStorage.setCurrentProjectId(this.currentProject.id);
  }

  async createSampleProject() {
    const proj = ProjectStorage.createNewProject('サンプル物件 (1LDK 42.5㎡)');
    const sampleImgData = generateSampleFloorPlan();
    proj.planImage = sampleImgData;
    proj.rawImage = sampleImgData;

    proj.scale = {
      p1: { x: 340 + 120, y: 320 + 140 },
      p2: { x: 400 + 120, y: 320 + 140 },
      realDistanceCm: 80,
      pxPerCm: 1.0
    };

    proj.attributes = [
      {
        id: 'door_main',
        type: 'door',
        x: 460,
        y: 460,
        widthCm: 80,
        rotation: 180,
        doorHinge: 'left',
        doorSwing: 'in'
      },
      {
        id: 'win_bed',
        type: 'window',
        x: 280,
        y: 680,
        widthCm: 200,
        rotation: 0
      },
      {
        id: 'win_living',
        type: 'window',
        x: 680,
        y: 680,
        widthCm: 240,
        rotation: 0
      }
    ];

    proj.layouts[0].items = [
      {
        instanceId: 'item_bed_1',
        furnitureId: 'bed_single',
        x: 260,
        y: 350,
        rotation: 0
      },
      {
        instanceId: 'item_sofa_1',
        furnitureId: 'sofa_2p',
        x: 650,
        y: 500,
        rotation: 0
      }
    ];

    proj.layouts.push({
      id: 'pattern_2',
      name: '案2 (セミダブル & デスク)',
      items: [
        {
          instanceId: 'item_bed_2',
          furnitureId: 'bed_semi_double',
          x: 270,
          y: 350,
          rotation: 0
        },
        {
          instanceId: 'item_desk_1',
          furnitureId: 'desk_work',
          x: 250,
          y: 560,
          rotation: 0
        }
      ]
    });

    this.projects.push(proj);
    ProjectStorage.saveAll(this.projects);
    this.selectProject(proj.id);
  }

  selectProject(projectId) {
    this.currentProject = this.projects.find((p) => p.id === projectId);
    if (!this.currentProject) return;
    ProjectStorage.setCurrentProjectId(this.currentProject.id);

    this.renderer.setProject(this.currentProject);

    if (this.currentProject.planImage) {
      const img = new Image();
      img.onload = () => {
        this.renderer.setPlanImage(img);
        this.renderer.resetView(img.width, img.height);
        this.checkInterferences();
        this.renderer.render();
      };
      img.src = this.currentProject.planImage;
    } else {
      this.renderer.setPlanImage(null);
      this.renderer.render();
    }

    this.renderProjectSelector();
    this.renderLayoutTabs();
    this.renderFurniturePalette();
  }

  checkInterferences() {
    if (!this.currentProject) return;
    const currentLayout = this.currentProject.layouts?.find(
      (l) => l.id === this.currentProject.currentLayoutId
    );
    if (!currentLayout || !currentLayout.items) return;

    const pxPerCm = this.currentProject.scale?.pxPerCm || 1.5;
    const interferences = new Map();
    let hasDoorConflict = false;
    let hasWindowConflict = false;

    for (const item of currentLayout.items) {
      const meta = this.renderer.getFurnitureMeta(item.furnitureId);
      if (!meta) continue;

      const wPx = meta.widthCm * pxPerCm;
      const hPx = meta.depthCm * pxPerCm;
      const itemCorners = CollisionEngine.getBoxCorners(item, wPx, hPx, item.rotation);

      const status = { door: false, window: false, wall: false };

      for (const attr of this.currentProject.attributes || []) {
        if (attr.type === 'door') {
          const doorR = attr.widthCm * pxPerCm;
          const hinge = { x: attr.x, y: attr.y };
          const doorAngleRad = (attr.rotation * Math.PI) / 180;
          const swingSign = attr.doorHinge === 'left' ? 1 : -1;
          const startRad = doorAngleRad;
          const endRad = doorAngleRad + swingSign * (Math.PI / 2);

          if (CollisionEngine.testSectorBoxIntersection(hinge, doorR, startRad, endRad, itemCorners)) {
            status.door = true;
            hasDoorConflict = true;
          }
        } else if (attr.type === 'window') {
          const winW = attr.widthCm * pxPerCm;
          const winCorners = CollisionEngine.getBoxCorners(attr, winW, 20, attr.rotation);
          if (CollisionEngine.testPolygonOverlap(itemCorners, winCorners)) {
            status.window = true;
            hasWindowConflict = true;
          }
        }
      }

      interferences.set(item.instanceId, status);
    }

    this.renderer.interferences = interferences;

    // Dynamic Island 直下のアラート更新
    const alertBox = document.getElementById('conflictAlertBox');
    if (alertBox) {
      if (hasDoorConflict) {
        alertBox.className = 'conflict-alert conflict-door';
        alertBox.innerHTML = '⛔ <strong>ドア開閉に干渉！</strong> ドアが開かない可能性があります';
        alertBox.style.display = 'block';
      } else if (hasWindowConflict) {
        alertBox.className = 'conflict-alert conflict-window';
        alertBox.innerHTML = '⚠️ <strong>窓が隠れます</strong> 採光や出入りをご確認ください';
        alertBox.style.display = 'block';
      } else {
        alertBox.style.display = 'none';
      }
    }
  }

  // 選択変更ハンドラ (フローティングドックの更新)
  onSelectionChange(type, item) {
    const dock = document.getElementById('floatingActionDock');
    if (!dock) return;

    if (!item) {
      dock.style.display = 'none';
      return;
    }

    dock.style.display = 'block';
    const doorControls = document.getElementById('dockDoorControls');

    if (type === 'furniture') {
      const meta = this.renderer.getFurnitureMeta(item.furnitureId);
      document.getElementById('dockItemTitle').textContent = meta?.name || '家具';
      document.getElementById('dockItemSubtitle').textContent = `${meta?.widthCm}×${meta?.depthCm}cm`;
      document.getElementById('dockRotationBadge').textContent = `${item.rotation}°`;
      if (doorControls) doorControls.style.display = 'none';
    } else if (type === 'attribute') {
      document.getElementById('dockItemTitle').textContent = item.type === 'door' ? '🚪 ドア' : '🪟 窓';
      document.getElementById('dockItemSubtitle').textContent = `幅 ${item.widthCm}cm`;
      document.getElementById('dockRotationBadge').textContent = `${item.rotation}°`;
      if (doorControls) {
        doorControls.style.display = item.type === 'door' ? 'block' : 'none';
      }
    }
  }

  setupUI() {
    // ステップ切替ボタン
    document.querySelectorAll('.tab-step-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = btn.dataset.step;
        this.setStep(step);
      });
    });

    // 新規物件作成
    document.getElementById('btnNewProject')?.addEventListener('click', () => {
      const name = prompt('新しい物件名を入力してください', '新居候補 A');
      if (name) {
        const p = ProjectStorage.createNewProject(name);
        this.projects.push(p);
        this.saveCurrentProject();
        this.selectProject(p.id);
        this.setStep('plan');
      }
    });

    // サンプル物件
    document.getElementById('btnLoadSample')?.addEventListener('click', () => {
      this.createSampleProject();
    });

    // 画像ファイルアップロード (写真アルバム & カメラ撮影)
    const handleFileChange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          this.handleImageUploaded(ev.target.result);
        };
        reader.readAsDataURL(file);
      }
      // 再選択できるように値をリセット
      e.target.value = '';
    };

    document.getElementById('planAlbumInput')?.addEventListener('change', handleFileChange);
    document.getElementById('planCameraInput')?.addEventListener('change', handleFileChange);
    document.getElementById('planFileInput')?.addEventListener('change', handleFileChange);

    // パース補正確定
    document.getElementById('btnApplyPerspective')?.addEventListener('click', () => {
      this.applyPerspectiveWarp();
    });

    // スケール確定
    document.getElementById('btnConfirmScale')?.addEventListener('click', () => {
      this.confirmScale();
    });

    // 属性追加 (ドア・窓)
    document.getElementById('btnAddDoor')?.addEventListener('click', () => {
      this.addAttribute('door');
    });
    document.getElementById('btnAddWindow')?.addEventListener('click', () => {
      this.addAttribute('window');
    });

    // フローティングドック: 90°回転
    document.getElementById('btnDockRotate')?.addEventListener('click', () => {
      this.rotateSelectedItem(90);
    });

    // フローティングドック: +15°微調整
    document.getElementById('btnDockFineRotate')?.addEventListener('click', () => {
      this.rotateSelectedItem(15);
    });

    // フローティングドック: ドア吊元反転
    document.getElementById('btnDockFlipDoor')?.addEventListener('click', () => {
      if (this.renderer.selectedItem?.type === 'attribute') {
        const attr = this.currentProject.attributes.find((a) => a.id === this.renderer.selectedItem.id);
        if (attr && attr.type === 'door') {
          attr.doorHinge = attr.doorHinge === 'left' ? 'right' : 'left';
          this.checkInterferences();
          this.renderer.render();
          this.saveCurrentProject();
        }
      }
    });

    // フローティングドック: 削除
    document.getElementById('btnDockDelete')?.addEventListener('click', () => {
      this.deleteSelectedItem();
    });

    // カスタム家具モーダル
    document.getElementById('btnOpenCustomModal')?.addEventListener('click', () => {
      document.getElementById('customFurnitureModal').style.display = 'flex';
    });
    document.getElementById('btnCloseCustomModal')?.addEventListener('click', () => {
      document.getElementById('customFurnitureModal').style.display = 'none';
    });
    document.getElementById('customFurnitureForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addCustomFurniture();
    });

    // 配置案追加 & 複製
    document.getElementById('btnAddLayoutPattern')?.addEventListener('click', () => {
      const name = prompt('新しい配置案の名前', `案 ${this.currentProject.layouts.length + 1}`);
      if (name) {
        const newLayout = {
          id: 'pattern_' + Date.now(),
          name: name,
          items: []
        };
        this.currentProject.layouts.push(newLayout);
        this.currentProject.currentLayoutId = newLayout.id;
        this.renderLayoutTabs();
        this.checkInterferences();
        this.renderer.render();
        this.saveCurrentProject();
      }
    });

    document.getElementById('btnDuplicateLayout')?.addEventListener('click', () => {
      const cur = this.currentProject.layouts.find((l) => l.id === this.currentProject.currentLayoutId);
      if (!cur) return;
      const dup = {
        id: 'pattern_' + Date.now(),
        name: cur.name + ' (写し)',
        items: JSON.parse(JSON.stringify(cur.items))
      };
      this.currentProject.layouts.push(dup);
      this.currentProject.currentLayoutId = dup.id;
      this.renderLayoutTabs();
      this.checkInterferences();
      this.renderer.render();
      this.saveCurrentProject();
    });

    // エクスポート
    document.getElementById('btnExportImage')?.addEventListener('click', () => {
      this.exportPlanImage();
    });

    // 免責事項
    document.getElementById('btnDisclaimerInfo')?.addEventListener('click', () => {
      alert(DISCLAIMER_TEXT);
    });
  }

  rotateSelectedItem(degToAdd) {
    if (this.renderer.selectedItem?.type === 'furniture') {
      const item = this.interaction.getPlacedFurniture(this.renderer.selectedItem.id);
      if (item) {
        item.rotation = (item.rotation + degToAdd) % 360;
        this.onSelectionChange('furniture', item);
        this.checkInterferences();
        this.renderer.render();
        this.saveCurrentProject();
      }
    } else if (this.renderer.selectedItem?.type === 'attribute') {
      const attr = this.currentProject.attributes.find((a) => a.id === this.renderer.selectedItem.id);
      if (attr) {
        attr.rotation = (attr.rotation + degToAdd) % 360;
        this.onSelectionChange('attribute', attr);
        this.checkInterferences();
        this.renderer.render();
        this.saveCurrentProject();
      }
    }
  }

  deleteSelectedItem() {
    if (this.renderer.selectedItem?.type === 'furniture') {
      const layout = this.currentProject.layouts.find((l) => l.id === this.currentProject.currentLayoutId);
      if (layout) {
        layout.items = layout.items.filter((i) => i.instanceId !== this.renderer.selectedItem.id);
        this.renderer.selectedItem = null;
        this.onSelectionChange(null, null);
        this.checkInterferences();
        this.renderer.render();
        this.saveCurrentProject();
      }
    } else if (this.renderer.selectedItem?.type === 'attribute') {
      this.currentProject.attributes = this.currentProject.attributes.filter(
        (a) => a.id !== this.renderer.selectedItem.id
      );
      this.renderer.selectedItem = null;
      this.onSelectionChange(null, null);
      this.checkInterferences();
      this.renderer.render();
      this.saveCurrentProject();
    }
  }

  setStep(step) {
    this.currentStep = step;
    document.querySelectorAll('.tab-step-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.step === step);
    });

    document.querySelectorAll('.step-panel').forEach((p) => (p.style.display = 'none'));
    const targetPanel = document.getElementById(`panel-${step}`);
    if (targetPanel) targetPanel.style.display = 'block';

    // ステップに応じてシートを開く
    if (step !== 'furniture') {
      this.setSheetState('half');
    }

    if (step === 'perspective') {
      this.interaction.setMode('perspective');
      if (this.renderer.planImage && !this.renderer.perspectiveCorners) {
        const w = this.renderer.planImage.width;
        const h = this.renderer.planImage.height;
        const margin = Math.min(w, h) * 0.08;
        this.renderer.perspectiveCorners = [
          { x: margin, y: margin },
          { x: w - margin, y: margin },
          { x: w - margin, y: h - margin },
          { x: margin, y: h - margin }
        ];
      }
    } else if (step === 'scale') {
      this.interaction.setMode('calibrate');
      if (!this.renderer.calibrationLine) {
        const cx = (this.renderer.planImage?.width || 800) / 2;
        const cy = (this.renderer.planImage?.height || 600) / 2;
        this.renderer.calibrationLine = {
          p1: { x: cx - 60, y: cy },
          p2: { x: cx + 60, y: cy }
        };
      }
    } else if (step === 'attribute') {
      this.interaction.setMode('attribute');
      this.renderer.perspectiveCorners = null;
      this.renderer.calibrationLine = null;
    } else {
      this.interaction.setMode('furniture');
      this.renderer.perspectiveCorners = null;
      this.renderer.calibrationLine = null;
    }

    this.renderer.render();
  }

  handleImageUploaded(dataUrl) {
    this.currentProject.rawImage = dataUrl;
    this.currentProject.planImage = dataUrl;
    const img = new Image();
    img.onload = () => {
      this.renderer.setPlanImage(img);
      this.renderer.resetView(img.width, img.height);
      this.saveCurrentProject();
      this.setStep('perspective');
    };
    img.src = dataUrl;
  }

  applyPerspectiveWarp() {
    if (!this.renderer.planImage || !this.renderer.perspectiveCorners) return;
    const corners = this.renderer.perspectiveCorners;

    const topW = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const botW = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
    const leftH = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
    const rightH = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

    const outW = Math.round(Math.max(topW, botW));
    const outH = Math.round(Math.max(leftH, rightH));

    const warpedCanvas = PerspectiveWarp.warpImageFast(this.renderer.planImage, corners, outW, outH, 16);
    if (!warpedCanvas) {
      alert('パース補正の計算に失敗しました。4隅のピン位置をご確認ください。');
      return;
    }

    const warpedDataUrl = warpedCanvas.toDataURL('image/png');
    this.currentProject.planImage = warpedDataUrl;
    this.currentProject.perspectiveCorners = corners;

    const img = new Image();
    img.onload = () => {
      this.renderer.setPlanImage(img);
      this.renderer.perspectiveCorners = null;
      this.renderer.resetView(outW, outH);
      this.saveCurrentProject();
      this.setStep('scale');
      alert('パース補正が完了しました！次に基準スケールを指定してください。');
    };
    img.src = warpedDataUrl;
  }

  confirmScale() {
    const line = this.renderer.calibrationLine;
    if (!line) return;
    const distPx = Math.hypot(line.p2.x - line.p1.x, line.p2.y - line.p1.y);
    const inputVal = parseFloat(document.getElementById('scaleRealInput')?.value || '80');
    if (!inputVal || inputVal <= 0) {
      alert('有効な実寸（cm）を入力してください');
      return;
    }

    const pxPerCm = distPx / inputVal;
    this.currentProject.scale = {
      p1: line.p1,
      p2: line.p2,
      realDistanceCm: inputVal,
      pxPerCm: pxPerCm
    };

    this.renderer.calibrationLine = null;
    this.saveCurrentProject();
    this.setStep('furniture');
    this.checkInterferences();
    this.renderer.render();

    alert(`縮尺を設定しました！（1cm ＝ ${pxPerCm.toFixed(2)}px）`);
  }

  addAttribute(type) {
    const cx = (this.renderer.planImage?.width || 800) / 2;
    const cy = (this.renderer.planImage?.height || 600) / 2;

    const newAttr = {
      id: 'attr_' + Date.now(),
      type: type,
      x: cx,
      y: cy,
      widthCm: type === 'door' ? 80 : 180,
      rotation: 0,
      doorHinge: 'left',
      doorSwing: 'in'
    };

    if (!this.currentProject.attributes) this.currentProject.attributes = [];
    this.currentProject.attributes.push(newAttr);
    this.renderer.selectedItem = { type: 'attribute', id: newAttr.id };
    this.onSelectionChange('attribute', newAttr);
    this.checkInterferences();
    this.renderer.render();
    this.saveCurrentProject();
  }

  addFurnitureToLayout(furnitureId) {
    const currentLayout = this.currentProject.layouts.find((l) => l.id === this.currentProject.currentLayoutId);
    if (!currentLayout) return;

    const centerWorld = this.renderer.screenToWorld(this.renderer.cssWidth / 2, this.renderer.cssHeight / 2);

    const instance = {
      instanceId: 'item_' + Date.now(),
      furnitureId: furnitureId,
      x: centerWorld.x,
      y: centerWorld.y,
      rotation: 0
    };

    currentLayout.items.push(instance);
    this.renderer.selectedItem = { type: 'furniture', id: instance.instanceId };
    this.onSelectionChange('furniture', instance);
    this.checkInterferences();
    this.renderer.render();
    this.saveCurrentProject();
  }

  addCustomFurniture() {
    const name = document.getElementById('customName').value;
    const width = parseFloat(document.getElementById('customWidth').value);
    const depth = parseFloat(document.getElementById('customDepth').value);
    const color = document.getElementById('customColor').value;

    if (!name || !width || !depth) {
      alert('すべての項目を入力してください');
      return;
    }

    const item = {
      id: 'custom_' + Date.now(),
      name: name,
      widthCm: width,
      depthCm: depth,
      color: color,
      category: '手持ち家具'
    };

    if (!this.currentProject.customFurniture) this.currentProject.customFurniture = [];
    this.currentProject.customFurniture.push(item);
    this.saveCurrentProject();

    document.getElementById('customFurnitureModal').style.display = 'none';
    this.renderFurniturePalette();
    this.addFurnitureToLayout(item.id);
  }

  renderProjectSelector() {
    const sel = document.getElementById('projectSelect');
    if (!sel) return;
    sel.innerHTML = '';
    this.projects.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (this.currentProject && p.id === this.currentProject.id) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
    sel.onchange = (e) => this.selectProject(e.target.value);
  }

  renderLayoutTabs() {
    const container = document.getElementById('layoutTabContainer');
    if (!container || !this.currentProject) return;
    container.innerHTML = '';

    this.currentProject.layouts.forEach((l) => {
      const btn = document.createElement('button');
      btn.className = `btn-layout-tab ${l.id === this.currentProject.currentLayoutId ? 'active' : ''}`;
      btn.textContent = l.name;
      btn.onclick = () => {
        this.currentProject.currentLayoutId = l.id;
        this.renderLayoutTabs();
        this.checkInterferences();
        this.renderer.render();
        this.saveCurrentProject();
      };
      container.appendChild(btn);
    });
  }

  renderFurniturePalette() {
    const container = document.getElementById('furnitureList');
    if (!container) return;
    container.innerHTML = '';

    const allFurniture = [
      ...PRESET_FURNITURE,
      ...(this.currentProject?.customFurniture || [])
    ];

    allFurniture.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'furniture-card';
      card.innerHTML = `
        <div class="card-top">
          <div class="furniture-color-dot" style="background:${f.color}"></div>
          <div class="furniture-name">${f.name}</div>
        </div>
        <div class="furniture-dim">${f.widthCm}×${f.depthCm}cm</div>
      `;
      card.onclick = () => this.addFurnitureToLayout(f.id);
      container.appendChild(card);
    });
  }

  exportPlanImage() {
    const link = document.createElement('a');
    link.download = `${this.currentProject.name}_レイアウト配置図.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
