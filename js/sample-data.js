/**
 * サンプル間取り図の生成
 * 初回起動時やすぐに試したい時のために、建築図面風の1LDK間取り図画像を動的生成します。
 */

export function generateSampleFloorPlan() {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');

  // 背景（方眼用紙風）
  ctx.fillStyle = '#fafaf9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // グリッド線
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // 図面タイトル
  ctx.fillStyle = '#1c1917';
  ctx.font = 'bold 24px -apple-system, sans-serif';
  ctx.fillText('【サンプル間取り図】1LDK (42.5㎡ / 洋室6.0帖・LDK 12.0帖)', 60, 60);
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillStyle = '#78716c';
  ctx.fillText('※スケール基準例: ドア幅 = 80cm / 洋室南窓幅 = 180cm', 60, 90);

  // 部屋外枠 (Living + Bedroom + Balcony)
  const ox = 120;
  const oy = 140;
  const w = 760;
  const h = 540;

  // 外壁
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#292524';
  ctx.strokeRect(ox, oy, w, h);

  // 部屋の塗り
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ox + 4, oy + 4, w - 8, h - 8);

  // 間仕切り壁 (洋室とLDKの仕切り)
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(ox + 340, oy);
  ctx.lineTo(ox + 340, oy + 360);
  ctx.stroke();

  // 部屋名ラベル
  ctx.fillStyle = '#44403c';
  ctx.font = 'bold 22px -apple-system, sans-serif';
  ctx.fillText('洋室 (Bedroom) 6.0帖', ox + 70, oy + 180);
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillStyle = '#a8a29e';
  ctx.fillText('床: フローリング', ox + 110, oy + 210);

  ctx.fillStyle = '#44403c';
  ctx.font = 'bold 22px -apple-system, sans-serif';
  ctx.fillText('LDK 12.0帖', ox + 490, oy + 240);
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillStyle = '#a8a29e';
  ctx.fillText('床: フローリング / 対面キッチン', ox + 470, oy + 270);

  // キッチンカウンター表現
  ctx.fillStyle = '#f5f5f4';
  ctx.strokeStyle = '#78716c';
  ctx.lineWidth = 2;
  ctx.fillRect(ox + 520, oy + 20, 200, 100);
  ctx.strokeRect(ox + 520, oy + 20, 200, 100);
  ctx.fillStyle = '#78716c';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Kitchen', ox + 590, oy + 75);

  // バルコニー (南側・下部)
  ctx.strokeStyle = '#a8a29e';
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(ox, oy + h, w, 60);
  ctx.setLineDash([]);
  ctx.fillStyle = '#78716c';
  ctx.font = '14px sans-serif';
  ctx.fillText('バルコニー (Balcony)', ox + 320, oy + h + 38);

  // 窓の表現 (水色)
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#38bdf8';
  // 洋室窓
  ctx.beginPath();
  ctx.moveTo(ox + 60, oy + h);
  ctx.lineTo(ox + 260, oy + h);
  ctx.stroke();
  ctx.fillStyle = '#0284c7';
  ctx.font = '12px sans-serif';
  ctx.fillText('窓 (掃き出し窓)', ox + 110, oy + h - 12);

  // リビング窓
  ctx.beginPath();
  ctx.moveTo(ox + 440, oy + h);
  ctx.lineTo(ox + 680, oy + h);
  ctx.stroke();
  ctx.fillText('窓 (ワイドサッシ)', ox + 520, oy + h - 12);

  // ドアの図面表記（洋室ドア 80cm想定）
  const doorX = ox + 340;
  const doorY = oy + 320;
  const doorR = 60;
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  // ドア開閉軌道 (アーク)
  ctx.beginPath();
  ctx.arc(doorX, doorY, doorR, Math.PI, 1.5 * Math.PI, false);
  ctx.stroke();
  // 扉線
  ctx.beginPath();
  ctx.moveTo(doorX, doorY);
  ctx.lineTo(doorX - doorR, doorY);
  ctx.stroke();
  ctx.fillStyle = '#dc2626';
  ctx.font = '12px sans-serif';
  ctx.fillText('片開きドア (80cm)', doorX - 110, doorY - 30);

  // スケールガイド目盛線 (上部)
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ox, oy - 20);
  ctx.lineTo(ox + 340, oy - 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ox, oy - 28);
  ctx.lineTo(ox, oy - 12);
  ctx.moveTo(ox + 340, oy - 28);
  ctx.lineTo(ox + 340, oy - 12);
  ctx.stroke();
  ctx.fillStyle = '#0369a1';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('3,400mm (約3.4m)', ox + 110, oy - 26);

  return canvas.toDataURL('image/png');
}
