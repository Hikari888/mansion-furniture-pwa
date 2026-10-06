/**
 * 幾何衝突・干渉判定エンジン
 * - SAT (分離軸定理) による回転矩形 (OBB) 同士の交差判定
 * - 扇形 (ドア開閉軌道) と回転矩形の交差判定
 * - 線分と線分の交差判定
 * - 点の内外判定
 */

export class CollisionEngine {
  /**
   * 回転矩形（中心、幅、高さ、回転角度）の4頂点を算出
   * @param {{x: number, y: number}} center
   * @param {number} width
   * @param {number} height
   * @param {number} rotationDeg
   * @returns {Array<{x: number, y: number}>} [TL, TR, BR, BL]
   */
  static getBoxCorners(center, width, height, rotationDeg) {
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const hw = width / 2;
    const hh = height / 2;

    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh }
    ];

    return corners.map((p) => ({
      x: center.x + p.x * cos - p.y * sin,
      y: center.y + p.x * sin + p.y * cos
    }));
  }

  /**
   * 分離軸定理 (SAT: Separating Axis Theorem) による2つの凸ポリゴン/矩形の交差判定
   * @param {Array<{x, y}>} polyA
   * @param {Array<{x, y}>} polyB
   * @returns {boolean}
   */
  static testPolygonOverlap(polyA, polyB) {
    const polygons = [polyA, polyB];

    for (let i = 0; i < polygons.length; i++) {
      const polygon = polygons[i];
      for (let j = 0; j < polygon.length; j++) {
        const k = (j + 1) % polygon.length;
        // 辺の法線ベクトル (分離軸)
        const edge = {
          x: polygon[k].x - polygon[j].x,
          y: polygon[k].y - polygon[j].y
        };
        const axis = { x: -edge.y, y: edge.x };

        // 軸の正規化
        const len = Math.hypot(axis.x, axis.y);
        if (len === 0) continue;
        const normAxis = { x: axis.x / len, y: axis.y / len };

        // 射影
        const [minA, maxA] = this.projectPolygon(polyA, normAxis);
        const [minB, maxB] = this.projectPolygon(polyB, normAxis);

        // 隙間があれば分離されている (交差なし)
        if (maxA < minB || maxB < minA) {
          return false;
        }
      }
    }

    return true; // 全軸で重複 => 交差している
  }

  static projectPolygon(polygon, axis) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of polygon) {
      const dot = p.x * axis.x + p.y * axis.y;
      if (dot < min) min = dot;
      if (dot > max) max = dot;
    }
    return [min, max];
  }

  /**
   * 2つの線分 AB と CD が交差するか
   */
  static testLineIntersection(p1, p2, p3, p4) {
    const ccw = (A, B, C) => {
      return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    };
    return (
      ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
      ccw(p1, p2, p3) !== ccw(p1, p2, p4)
    );
  }

  /**
   * 点がポリゴン内部にあるか (レイキャスティングアルゴリズム)
   */
  static isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * 扇形 (Door Swing Sector) と回転矩形 (Furniture Box) の交差判定
   * 吊元 (center), 半径 (radius), 開始角 (startAngleRad), 終了角 (endAngleRad)
   * @param {{x: number, y: number}} center - ドアの吊元
   * @param {number} radius - ドアの幅
   * @param {number} startAngleRad - 閉じた状態の角度
   * @param {number} endAngleRad - 開ききった状態の角度
   * @param {Array<{x, y}>} boxCorners - 家具の4頂点
   * @returns {boolean}
   */
  static testSectorBoxIntersection(center, radius, startAngleRad, endAngleRad, boxCorners) {
    // 角度を正規化 (startAngle <= endAngle に整える)
    let a1 = startAngleRad;
    let a2 = endAngleRad;
    if (a2 < a1) {
      const t = a1;
      a1 = a2;
      a2 = t;
    }
    // 差が 2*PI を超える場合は円全体
    const angleSpan = a2 - a1;

    // 1. 吊元が家具の内部にある場合 => 干渉
    if (this.isPointInPolygon(center, boxCorners)) {
      return true;
    }

    // 2. 家具のいずれかの頂点が扇形の内部にあるか
    for (const pt of boxCorners) {
      const dx = pt.x - center.x;
      const dy = pt.y - center.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= radius * radius) {
        let angle = Math.atan2(dy, dx);
        // 角度差のチェック
        if (this.isAngleBetween(angle, a1, a2)) {
          return true;
        }
      }
    }

    // 3. 扇形の境界線 (2本の動径線分) が家具の4辺と交差するか
    const pStart = {
      x: center.x + radius * Math.cos(a1),
      y: center.y + radius * Math.sin(a1)
    };
    const pEnd = {
      x: center.x + radius * Math.cos(a2),
      y: center.y + radius * Math.sin(a2)
    };

    for (let i = 0; i < 4; i++) {
      const b1 = boxCorners[i];
      const b2 = boxCorners[(i + 1) % 4];

      if (this.testLineIntersection(center, pStart, b1, b2)) return true;
      if (this.testLineIntersection(center, pEnd, b1, b2)) return true;
    }

    // 4. 扇形の円弧部分が家具の辺と交差するか
    for (let i = 0; i < 4; i++) {
      const b1 = boxCorners[i];
      const b2 = boxCorners[(i + 1) % 4];
      if (this.testArcSegmentIntersection(center, radius, a1, a2, b1, b2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 角度が [a1, a2] の間にあるかを正規化して検査
   */
  static isAngleBetween(angle, a1, a2) {
    const twoPi = Math.PI * 2;
    // 差角の正規化
    const normalize = (rad) => {
      let r = rad % twoPi;
      if (r < 0) r += twoPi;
      return r;
    };
    const normA = normalize(angle);
    const norm1 = normalize(a1);
    const norm2 = normalize(a2);

    if (norm1 <= norm2) {
      return normA >= norm1 && normA <= norm2;
    } else {
      // 0度をまたぐ場合
      return normA >= norm1 || normA <= norm2;
    }
  }

  /**
   * 円弧 (center, radius, a1, a2) と線分 (p1, p2) の交差判定
   */
  static testArcSegmentIntersection(center, radius, a1, a2, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const fx = p1.x - center.x;
    const fy = p1.y - center.y;

    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - radius * radius;

    const discriminant = B * B - 4 * A * C;
    if (discriminant < 0) return false;

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-B - sqrtDisc) / (2 * A);
    const t2 = (-B + sqrtDisc) / (2 * A);

    for (const t of [t1, t2]) {
      if (t >= 0 && t <= 1) {
        const ix = p1.x + t * dx;
        const iy = p1.y + t * dy;
        const angle = Math.atan2(iy - center.y, ix - center.x);
        if (this.isAngleBetween(angle, a1, a2)) {
          return true;
        }
      }
    }

    return false;
  }
}
