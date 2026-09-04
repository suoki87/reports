// 아트 교체 지점 — 그림에 관한 것은 전부 여기 모여 있다.
//
// 지금은 Tiny Swords 에셋을 쓴다. 나중에 고유 아트로 바꿀 때
// assets/sprite-map.json 의 경로만 갈아끼우면 되고, 다른 파일은 건드리지 않는다.
//
// 에셋 파일이 없으면 도형으로 그린다 — 그림 없이도 게임이 돌아가야
// "재미있는가" 를 그림과 분리해서 판단할 수 있다.

const cache = new Map();
let spriteMap = null;
let mapLoaded = false;

/** sprite-map.json 을 읽는다. 없으면 도형 폴백으로 간다. */
export async function loadSpriteMap(url = './assets/sprite-map.json') {
  if (mapLoaded) return spriteMap;
  mapLoaded = true;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    spriteMap = await res.json();
  } catch {
    spriteMap = null;   // 조용히 도형으로 간다
  }
  return spriteMap;
}

/** 이미지를 한 번만 읽고 캐시한다. 실패하면 null. */
function loadImage(src) {
  if (cache.has(src)) return cache.get(src);
  const img = new Image();
  const entry = { img, ready: false, failed: false };
  img.onload = () => { entry.ready = true; };
  img.onerror = () => { entry.failed = true; };
  img.src = src;
  cache.set(src, entry);
  return entry;
}

/**
 * 스프라이트를 그린다. 에셋이 없으면 fallback 도형을 그린다.
 *
 * @param key  'player' | 'enemy' | 'boss' | 'ground' 등 논리 이름
 * @param frame 애니메이션 프레임 번호 (시트가 있을 때만 의미)
 */
export function drawSprite(ctx, key, x, y, w, h, frame = 0, flip = false) {
  const def = spriteMap?.[key];
  if (def) {
    const entry = loadImage(def.src);
    if (entry.ready) {
      const fw = def.frameWidth ?? entry.img.width;
      const fh = def.frameHeight ?? entry.img.height;
      const cols = def.cols ?? 1;
      const f = def.frames ? frame % def.frames : 0;
      const sx = (def.col0 ?? 0) * fw + (f % cols) * fw;
      const sy = (def.row ?? 0) * fh;
      ctx.save();
      ctx.imageSmoothingEnabled = false;   // 픽셀 아트는 절대 부드럽게 하지 않는다
      if (flip) {
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(entry.img, sx, sy, fw, fh, 0, 0, w, h);
      } else {
        ctx.drawImage(entry.img, sx, sy, fw, fh, x, y, w, h);
      }
      ctx.restore();
      return;
    }
    if (!entry.failed) return;   // 아직 로딩 중이면 이번 프레임은 건너뛴다
  }
  drawFallback(ctx, key, x, y, w, h, frame);
}

/** 에셋이 없을 때의 도형. 프로토타입은 이걸로도 충분히 판단할 수 있다. */
function drawFallback(ctx, key, x, y, w, h, frame) {
  const bob = Math.sin(frame * 0.25) * h * 0.03;   // 살짝 위아래로 — 살아 있어 보이게
  ctx.save();
  if (key === 'player') {
    ctx.fillStyle = '#5b8dd6';
    roundRect(ctx, x + w * 0.2, y + h * 0.25 + bob, w * 0.6, h * 0.6, w * 0.12);
    ctx.fill();
    ctx.fillStyle = '#f0d5a8';                      // 머리
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.22 + bob, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8d8e0';                      // 칼
    ctx.fillRect(x + w * 0.72, y + h * 0.3 + bob, w * 0.1, h * 0.45);
  } else if (key === 'boss') {
    ctx.fillStyle = '#a83a3a';
    roundRect(ctx, x + w * 0.1, y + h * 0.15 + bob, w * 0.8, h * 0.75, w * 0.14);
    ctx.fill();
    ctx.fillStyle = '#2b1414';
    ctx.beginPath();
    ctx.arc(x + w * 0.36, y + h * 0.38 + bob, w * 0.07, 0, Math.PI * 2);
    ctx.arc(x + w * 0.64, y + h * 0.38 + bob, w * 0.07, 0, Math.PI * 2);
    ctx.fill();
  } else if (key === 'enemy') {
    ctx.fillStyle = '#7a9a5a';
    roundRect(ctx, x + w * 0.22, y + h * 0.28 + bob, w * 0.56, h * 0.56, w * 0.12);
    ctx.fill();
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.24 + bob, w * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 지금 그림이 진짜 스프라이트인지 도형인지. 화면에 표시해 헷갈림을 막는다. */
export function usingRealArt() {
  return !!spriteMap;
}
