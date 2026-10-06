/**
 * データモデルとプリセット家具・ストレージ管理
 */

export const PRESET_FURNITURE = [
  { id: 'bed_single', name: 'シングルベッド', widthCm: 100, depthCm: 200, color: '#6366f1', category: '寝室' },
  { id: 'bed_semi_double', name: 'セミダブルベッド', widthCm: 120, depthCm: 200, color: '#4f46e5', category: '寝室' },
  { id: 'bed_double', name: 'ダブルベッド', widthCm: 140, depthCm: 200, color: '#4338ca', category: '寝室' },
  { id: 'sofa_2p', name: '2人掛けソファ', widthCm: 140, depthCm: 80, color: '#0ea5e9', category: 'リビング' },
  { id: 'sofa_3p', name: '3人掛けソファ', widthCm: 185, depthCm: 85, color: '#0284c7', category: 'リビング' },
  { id: 'chair_1p', name: 'パーソナルチェア', widthCm: 65, depthCm: 70, color: '#38bdf8', category: 'リビング' },
  { id: 'dining_table_4', name: 'ダイニングテーブル(4人用)', widthCm: 135, depthCm: 80, color: '#10b981', category: 'ダイニング' },
  { id: 'desk_work', name: 'ワークデスク', widthCm: 120, depthCm: 60, color: '#f59e0b', category: '書斎' },
  { id: 'desk_compact', name: 'コンパクトデスク', widthCm: 90, depthCm: 50, color: '#d97706', category: '書斎' },
  { id: 'tv_board', name: 'テレビボード', widthCm: 150, depthCm: 40, color: '#8b5cf6', category: 'リビング' },
  { id: 'refrigerator', name: '冷蔵庫', widthCm: 60, depthCm: 65, color: '#64748b', category: 'キッチン' },
  { id: 'washing_machine', name: '洗濯機 (防水パン)', widthCm: 64, depthCm: 64, color: '#94a3b8', category: '水回り' },
  { id: 'bookshelf', name: '本棚・シェルフ', widthCm: 80, depthCm: 30, color: '#a855f7', category: '収納' },
  { id: 'kitchen_counter', name: 'キッチンボード', widthCm: 90, depthCm: 45, color: '#059669', category: 'キッチン' }
];

export const DISCLAIMER_TEXT = 
  "【ご注意・免責事項】本アプリは図面に基づく簡易レイアウトシミュレーターです。梁、柱（PS）、巾木、コンセント・スイッチ位置、カーテンレール等により実際の有効寸法は異なります。最終的な家具搬入・配置の可否は、必ず現地で実測確認を行ってください。";

export class ProjectStorage {
  static STORAGE_KEY = 'mansion_furniture_pwa_projects_v1';
  static CURRENT_KEY = 'mansion_furniture_pwa_current_id_v1';

  static loadAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load projects', e);
      return [];
    }
  }

  static saveAll(projects) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.error('Failed to save projects', e);
    }
  }

  static getCurrentProjectId() {
    return localStorage.getItem(this.CURRENT_KEY);
  }

  static setCurrentProjectId(id) {
    localStorage.setItem(this.CURRENT_KEY, id);
  }

  static createNewProject(name = '新規物件') {
    const newProj = {
      id: 'proj_' + Date.now(),
      name: name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      planImage: null, // DataURL
      rawImage: null,  // 補正前画像
      perspectiveCorners: null, // 補正指定4点 [{x,y}, ...]
      scale: null, // { p1: {x,y}, p2: {x,y}, realDistanceCm: 80, pxPerCm: 1.5 }
      roomBoundary: null, // [{x,y}, ...] 部屋外郭
      attributes: [], // 窓・ドア [{id, type, x, y, widthCm, rotation, doorHinge, doorSwing}]
      customFurniture: [], // ユーザー登録家具 [{id, name, widthCm, depthCm, color}]
      layouts: [
        { id: 'pattern_1', name: '配置案 1', items: [] }
      ],
      currentLayoutId: 'pattern_1'
    };
    return newProj;
  }
}
