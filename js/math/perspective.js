/**
 * 4点透視投影（ホモグラフィ）変換エンジン
 * 斜めから撮影された図面画像を正寸の平面画像に変換します。
 */

export class PerspectiveWarp {
  /**
   * 4点 (srcPoints) から 矩形 (dstPoints) への 3x3 ホモグラフィ行列 H を計算
   * points: [{x, y}, {x, y}, {x, y}, {x, y}] (順序: TL, TR, BR, BL)
   */
  static getHomography(srcPoints, dstPoints) {
    // 8x8 の連立一次方程式 A * h = b を構築
    const A = [];
    const b = [];

    for (let i = 0; i < 4; i++) {
      const sx = srcPoints[i].x;
      const sy = srcPoints[i].y;
      const dx = dstPoints[i].x;
      const dy = dstPoints[i].y;

      A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
      b.push(dx);

      A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
      b.push(dy);
    }

    const h = this.solveGaussian(A, b);
    if (!h) return null;

    // 3x3 行列 [ [h0, h1, h2], [h3, h4, h5], [h6, h7, 1] ]
    return [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1.0]
    ];
  }

  /**
   * ガウスの消去法 (Gaussian Elimination)
   */
  static solveGaussian(A, b) {
    const n = A.length;
    for (let i = 0; i < n; i++) {
      // ピボット選択
      let maxEl = Math.abs(A[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > maxEl) {
          maxEl = Math.abs(A[k][i]);
          maxRow = k;
        }
      }

      for (let k = i; k < n; k++) {
        const tmp = A[maxRow][k];
        A[maxRow][k] = A[i][k];
        A[i][k] = tmp;
      }
      const tmpB = b[maxRow];
      b[maxRow] = b[i];
      b[i] = tmpB;

      if (Math.abs(A[i][i]) < 1e-10) return null; // 特異行列

      for (let k = i + 1; k < n; k++) {
        const c = -A[k][i] / A[i][i];
        for (let j = i; j < n; j++) {
          if (i === j) {
            A[k][j] = 0;
          } else {
            A[k][j] += c * A[i][j];
          }
        }
        b[k] += c * b[i];
      }
    }

    // 後退代入
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = b[i];
      for (let j = i + 1; j < n; j++) {
        sum -= A[i][j] * x[j];
      }
      x[i] = sum / A[i][i];
    }
    return x;
  }

  /**
   * 3x3 行列の逆行列を計算
   */
  static invertMatrix(M) {
    const a = M[0][0], b = M[0][1], c = M[0][2];
    const d = M[1][0], e = M[1][1], f = M[1][2];
    const g = M[2][0], h = M[2][1], i = M[2][2];

    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-10) return null;

    const invDet = 1 / det;
    return [
      [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
      [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
      [(d * h - e * g) * invDet, (g * b - a * h) * invDet, (a * e - b * d) * invDet]
    ];
  }

  /**
   * 高速三角形メッシュワープ (Canvas 2D を用いた高品質ハードウェアアクセラレーション)
   * 4点指定された四角形領域を長方形キャンバスに補正展開
   * @param {HTMLImageElement|HTMLCanvasElement} srcImage
   * @param {Array<{x, y}>} srcQuad [TL, TR, BR, BL]
   * @param {number} outWidth
   * @param {number} outHeight
   * @param {number} subdivisions 分割数 (例: 16)
   * @returns {HTMLCanvasElement}
   */
  static warpImageFast(srcImage, srcQuad, outWidth, outHeight, subdivisions = 16) {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    const ctx = outCanvas.getContext('2d');

    const dstQuad = [
      { x: 0, y: 0 },
      { x: outWidth, y: 0 },
      { x: outWidth, y: outHeight },
      { x: 0, y: outHeight }
    ];

    // dst -> src のホモグラフィ
    const H_dst_to_src = this.getHomography(dstQuad, srcQuad);
    if (!H_dst_to_src) return null;

    const transformPoint = (H, x, y) => {
      const px = H[0][0] * x + H[0][1] * y + H[0][2];
      const py = H[1][0] * x + H[1][1] * y + H[1][2];
      const pz = H[2][0] * x + H[2][1] * y + H[2][2];
      return { x: px / pz, y: py / pz };
    };

    const stepX = outWidth / subdivisions;
    const stepY = outHeight / subdivisions;

    // グリッドの各四角形を2つの三角形に分割してテクスチャマッピング
    for (let i = 0; i < subdivisions; i++) {
      for (let j = 0; j < subdivisions; j++) {
        const x0 = i * stepX;
        const y0 = j * stepY;
        const x1 = (i + 1) * stepX;
        const y1 = (j + 1) * stepY;

        const d00 = { x: x0, y: y0 };
        const d10 = { x: x1, y: y0 };
        const d11 = { x: x1, y: y1 };
        const d01 = { x: x0, y: y1 };

        const s00 = transformPoint(H_dst_to_src, x0, y0);
        const s10 = transformPoint(H_dst_to_src, x1, y0);
        const s11 = transformPoint(H_dst_to_src, x1, y1);
        const s01 = transformPoint(H_dst_to_src, x0, y1);

        // 三角形1: (d00, d10, d01) -> (s00, s10, s01)
        this.renderTriangle(ctx, srcImage, [s00, s10, s01], [d00, d10, d01]);
        // 三角形2: (d10, d11, d01) -> (s10, s11, s01)
        this.renderTriangle(ctx, srcImage, [s10, s11, s01], [d10, d11, d01]);
      }
    }

    return outCanvas;
  }

  /**
   * 1つの三角形のアフィン変換テクスチャ描画
   */
  static renderTriangle(ctx, img, s, d) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d[0].x, d[0].y);
    ctx.lineTo(d[1].x, d[1].y);
    ctx.lineTo(d[2].x, d[2].y);
    ctx.closePath();
    ctx.clip();

    // 元三角形 s から 出力先三角形 d へのアフィン変換行列を算出
    const denom = s[0].x * (s[1].y - s[2].y) - s[1].x * (s[0].y - s[2].y) + s[2].x * (s[0].y - s[1].y);
    if (Math.abs(denom) < 1e-10) {
      ctx.restore();
      return;
    }

    const a = (d[0].x * (s[1].y - s[2].y) - d[1].x * (s[0].y - s[2].y) + d[2].x * (s[0].y - s[1].y)) / denom;
    const b = (d[0].y * (s[1].y - s[2].y) - d[1].y * (s[0].y - s[2].y) + d[2].y * (s[0].y - s[1].y)) / denom;
    const c = (s[0].x * (d[1].x - d[2].x) - s[1].x * (d[0].x - d[2].x) + s[2].x * (d[0].x - d[1].x)) / denom;
    const dVal = (s[0].x * (d[1].y - d[2].y) - s[1].x * (d[0].y - d[2].y) + s[2].x * (d[0].y - d[1].y)) / denom;
    const e = (s[0].x * (s[1].y * d[2].x - s[2].y * d[1].x) - s[1].x * (s[0].y * d[2].x - s[2].y * d[0].x) + s[2].x * (s[0].y * d[1].x - s[1].y * d[0].x)) / denom;
    const f = (s[0].x * (s[1].y * d[2].y - s[2].y * d[1].y) - s[1].x * (s[0].y * d[2].y - s[2].y * d[0].y) + s[2].x * (s[0].y * d[1].y - s[1].y * d[0].y)) / denom;

    ctx.transform(a, b, c, dVal, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}
