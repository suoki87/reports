/*
 * ⚠️ 생성 파일 — 손으로 고치지 마라.
 *
 *   node tools/board/bake-art.js
 *
 * 기획 보드가 배포본(src/ 가 없는 곳)에서도 게임과 같은 그림을 그리도록,
 * 아트 렌더러와 그 의존 모듈을 파일 하나로 접은 것이다.
 * 원본은 다음이고, 수정은 원본에서 한다:
 *   src/game/art/palette.js
 *   src/game/art/ink.js
 *   src/core/balance.js
 *   src/core/meta.js
 *   src/core/weapons.js
 *   src/game/sim.js
 *   src/game/art/characters.js
 *   src/game/art/icons.js
 */

/* ─────────── src/game/art/palette.js ─────────── */
/**
 * GunDude 팔레트 — 시안 11장에서 픽셀 빈도로 직접 추출한 값이다.
 * 눈대중이 아니라 측정값이므로 임의로 바꾸지 말 것.
 */
const PALETTE = {
  // 게임 화면 (흰 배경 82.7% + 검은 선이 화면을 지배한다)
  paper:      '#FFFFFF',
  ink:        '#000000',

  // 캐릭터 4색이 전부다
  dude:       '#FFFFFF',  // 플레이어 — 흰색
  boyz:       '#FFD8B9',  // 살구
  demonz:     '#E07363',  // 벽돌 빨강
  machinz:    '#CCDBDE',  // 연한 청회색
  slate:      '#9097C8',  // 슬레이트 블루 (기계·장비)

  // 재화·이펙트
  gold:       '#F7BE00',
  goldDark:   '#F4D17C',
  hpRed:      '#DD3131',
  xpAmber:    '#F5A623',

  // 메뉴 (종이 UI)
  parchment:  '#EEE4CD',
  parchDark:  '#C8B58B',
  wood:       '#715846',
  woodDark:   '#4C2E1E',
  backdrop:   '#28475F',
};

/* ─────────── src/game/art/ink.js ─────────── */
/**
 * 손그림 잉크 렌더러.
 *
 * 이 화풍의 정체는 "굵은 검은 외곽선 + 플랫 채색 + 미세하게 떨리는 선"이다.
 * 그라데이션도 텍스처도 없다. 즉 도형 몇 개로 재현 가능하다는 뜻이고,
 * 그래서 스프라이트 이미지 없이 Canvas 명령만으로 그릴 수 있다.
 *
 * 흔들림은 난수가 아니라 시드 해시로 만든다.
 *  - 같은 엔티티는 매 프레임 같은 모양으로 그려진다 (떨림 방지)
 *  - 엔티티마다 다른 모양이 나온다 (복붙 느낌 방지)
 *  - 재생·리플레이·후일 멀티플레이에서 결정적으로 재현된다
 */

/** 정수 시드 → [0,1). 부동소수점 누적 오차가 없도록 정수 연산만 쓴다. */
function hash01(seed, salt = 0) {
  let h = (seed | 0) ^ (salt * 0x9e3779b1 | 0);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

/** [-1,1) 범위의 시드 흔들림 */
function jitter(seed, salt) {
  return hash01(seed, salt) * 2 - 1;
}

/** 점들을 부드러운 닫힌 곡선으로 잇는다. 중점 통과 방식이라 모서리가 자연스럽다. */
function tracePath(ctx, pts, close = true) {
  if (pts.length < 2) return;
  ctx.beginPath();
  if (!close) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i += 1) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    return;
  }
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i += 1) {
    const cur = pts[i];
    const nxt = pts[(i + 1) % n];
    m = mid(cur, nxt);
    ctx.quadraticCurveTo(cur[0], cur[1], m[0], m[1]);
  }
  ctx.closePath();
}

/** 흔들리는 둥근 사각형의 꼭짓점 목록. GunDude 캐릭터 몸통의 기본형. */
function wobbleRoundRect(x, y, w, h, r, seed, wob = 1.2) {
  const pts = [];
  const corner = (cx, cy, from, to, salt) => {
    const steps = 4;
    for (let i = 0; i <= steps; i += 1) {
      const a = from + (to - from) * (i / steps);
      const rr = r + jitter(seed, salt * 31 + i) * wob;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  const HP = Math.PI / 2;
  // 위 변
  pts.push([x + r + jitter(seed, 1) * wob, y + jitter(seed, 2) * wob]);
  pts.push([x + w - r + jitter(seed, 3) * wob, y + jitter(seed, 4) * wob]);
  corner(x + w - r, y + r, -HP, 0, 5);
  pts.push([x + w + jitter(seed, 6) * wob, y + h - r + jitter(seed, 7) * wob]);
  corner(x + w - r, y + h - r, 0, HP, 8);
  pts.push([x + r + jitter(seed, 9) * wob, y + h + jitter(seed, 10) * wob]);
  corner(x + r, y + h - r, HP, Math.PI, 11);
  pts.push([x + jitter(seed, 12) * wob, y + r + jitter(seed, 13) * wob]);
  corner(x + r, y + r, Math.PI, Math.PI * 1.5, 14);
  return pts;
}

/** 흔들리는 원. 머리·바퀴·이펙트에 쓴다. */
function wobbleCircle(cx, cy, r, seed, wob = 1.2, steps = 14) {
  const pts = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r + jitter(seed, i + 1) * wob;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

/** 채우고 외곽선을 두른다 — 이 화풍의 유일한 렌더링 동작이다. */
function inkShape(ctx, pts, fill, lineWidth = 4, stroke = '#000000') {
  tracePath(ctx, pts, true);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

/**
 * 각진 도형 — 직선으로만 잇는다.
 *
 * inkShape 는 꼭짓점 사이를 곡선으로 이어 유기적인 모양을 만든다. 캐릭터에는 맞지만
 * 총에 쓰면 사각형이 타원이 되어 전부 풍선처럼 뭉개진다 (실측으로 확인).
 * 기계는 각져야 한다.
 */
function inkPoly(ctx, pts, fill, lineWidth = 3, stroke = '#000000') {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 3;
    ctx.lineCap = 'butt';
    ctx.stroke();
  }
}

/** 외곽선 없는 선 하나 (눈썹·팔·이펙트) */
function inkStroke(ctx, pts, lineWidth = 4, stroke = '#000000') {
  tracePath(ctx, pts, false);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** 바닥 그림자 — 시안에서 캐릭터 발밑에 있는 납작한 검은 타원. */
function groundShadow(ctx, cx, cy, rx, ry = rx * 0.32, alpha = 0.85) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ─────────── src/core/balance.js ─────────── */
/**
 * 밸런스 수식 — 단일 진실 공급원.
 *
 * 설계 축 (v3):
 *  1. 이동과 사격은 배타적이다. 멈춰야 쏜다 (궁수의 전설 방식).
 *     그래서 "지금 멈춰서 쏠까, 피할까" 가 매 순간의 선택이 된다.
 *  2. 적은 느리고 예비동작 중 멈춘다. 다가오는 동안 판단할 시간이 있고,
 *     공격 모션을 보고 움직이면 확실히 피할 수 있다.
 *  3. 성장은 두 갈래다. 로비의 영구 스탯(숫자)과 인게임 무기(노는 방법).
 *  4. 웨이브를 넘을 때마다 상점, 3웨이브마다 패턴 공략형 보스.
 */

const B = {
  designW: 720,
  designH: 1280,

  // --- 아레나 (배경 그림 고원 실측, 가로세로비 0.80) ---
  arenaX: 360,
  arenaY: 700,
  arenaRx: 345,
  arenaRy: 276,
  arenaImg: { cx: 0.4971, cy: 0.4106, rx: 0.4736, ry: 0.3784 },

  // --- 플레이어 ---
  playerR: 15,
  playerSpeed: 172,
  playerMaxHp: 24,
  invulnSec: 0.75,
  strideLen: 26,

  // --- 기본 사격 (무기가 이 위에 곱해진다) ---
  fireIntervalBase: 0.62,
  baseDamage: 6,
  bulletR: 6,

  // --- 스킬: 충격파 ---
  skillCooldown: 50,      // 런당 한 번. 성장으로 줄여 나간다
  skillRadius: 92,        // 처음엔 발밑만 겨우 쓸어낸다
  skillExpandSec: 0.30,
  skillDamageMul: 1.15,   // 처음엔 밀어내는 용도지 죽이는 용도가 아니다
  skillKnockback: 250,
  knockbackDrag: 3.2,

  /**
   * 유전자 조각 줍기.
   *
   * 왜 줍게 만드는가 — **죽는 이유를 플레이어의 선택으로 만들기 위해서다.**
   * 지금 구조에서는 마음먹고 도망 다니면 거의 안 죽는다(카이팅). 카이팅 자체는
   * 원하는 행동이지만, 그러면 죽는 길이 "적을 대량으로 쏟는 것" 하나뿐이 된다.
   * 그건 플레이어가 진 게 아니라 게임이 밀어붙인 것이라 좋은 패배가 아니다.
   *
   * 조각은 **적이 죽은 자리**에 떨어진다. 그 자리는 대개 위험한 자리다.
   * 그리고 **시간이 지나면 사라진다** — 안 사라지면 나중에 안전할 때 주우면 되므로
   * 아무 고민도 생기지 않는다. 사라지기 때문에 "지금 갈까, 포기할까" 가 성립한다.
   *
   * 이 값을 치르지 않는 길이 로비의 '촉수 감각'(자석) 해금이다.
   */
  bioPickup: true,            // false 면 예전처럼 처치 즉시 획득 (A/B 비교용)
  shardLife: 11.5,            // 조각 수명(초). 결단할 시간은 주되 무한하지는 않게
  shardBlink: 3.0,            // 사라지기 전 깜빡이는 구간
  shardMax: 5,                // 조각 하나가 담는 최대량. 넘치면 여러 개로 흩어진다
  shardR: 9,
  // 획득 반경을 키웠으니 흩어지는 거리도 같이 늘린다.
  // 안 그러면 코앞에서 죽인 적의 조각이 전부 발밑에 떨어져 "걸어가서 줍는다" 가 사라진다.
  shardScatter: 84,           // 죽은 자리에서 튀는 거리
  // 닿았는데도 안 먹히는 느낌이 있었다. 조각이 끌려오는 속도가 빨라
  // 한 프레임 사이에 판정 반경을 지나쳐 버리는 경우가 생긴다.
  pickupR: 30,                // 획득 판정 반경 (+ playerR 이 실제 반경)
  magnetBaseR: 42,            // 기본 흡인 — 거의 밟아야 한다
  magnetUnlockedR: 165,       // '촉수 감각' 해금 시
  magnetPull: 460,            // 끌려오는 가속
  // 자석에 상한을 건다. 맵 전체를 덮으면 "가서 줍는다" 라는 규칙 자체가 사라진다.
  // 아무리 투자해도 절반 남짓까지만 — 여전히 어디에 설지는 골라야 한다.
  magnetCapR: 190,

  /**
   * 보급품 — 웨이브마다 낮은 확률로 맵에 떨어진다.
   *
   * 목적은 자원이 아니라 **"저기로 가고 싶다" 를 만드는 것**이다.
   * 피하면서 쏘기만 하면 플레이어는 안전한 구석에 머문다. 그러면 지도가 없는 것과 같다.
   * 그래서 보급품은 **플레이어에게서 먼 자리**에 놓고 **수명을 건다.**
   * 가까이 놓거나 안 사라지면 그건 선물이지 결단이 아니다.
   */
  // 【스테이지당 정확히 1회】 확률로 두면 어떤 판은 세 번 나오고 어떤 판은 안 나온다.
  // 희소해야 "저기로 가고 싶다" 가 성립하는데, 흔해지면 그냥 길목이 된다.
  // 그래서 스테이지마다 보급 웨이브를 하나 미리 뽑아 두고 거기서만 낸다.
  // 첫 웨이브는 제외한다 — 규칙도 모르는데 갈 곳부터 생기면 배울 게 없다.
  supplyFirstWaveInStage: 2,  // 이 순번 이후의 웨이브에서만
  supplyChance: 1.0,          // 뽑힌 웨이브에서는 반드시 나온다
  supplyLife: 15,             // 수명(초)
  supplyBlink: 4,
  supplyMinDist: 230,         // 플레이어로부터 최소 이 거리 밖에 놓는다
  supplyR: 17,
  supplyHeartFrac: 0.35,      // 하트 회복량 = 최대 체력의 35%
  supplyPouchBase: 16,
  supplyPouchPerWave: 4,
  supplyClusterBase: 5,
  supplyClusterPerWave: 1.4,

  // --- 적 공통 ---
  enemyBaseHp: 20,
  enemyHpGrowthPerWave: 0.22,   // 웨이브당 +22%. 시간이 아니라 진행도가 난이도를 올린다
  enemyDamageGrowthPerWave: 0.13,  // 적 피해도 같이 오른다. 안 그러면 후반에 위협이 사라진다
  enemySeparation: 0.8,
  spawnDropSec: 0.5,
  fallSec: 0.8,

  /**
   * 적 종류.
   *  느리다. 다가오는 동안 "죽일 수 있을까, 한 대 맞겠는데" 를 판단할 시간이 있어야 한다.
   *  예비동작 중에는 멈춘다 — 그래야 그 순간 이동한 플레이어가 확실히 피한다.
   */
  kinds: {
    boyz: {
      r: 16, speed: 62, hpMul: 1.0, money: 3, bio: 1, unlockWave: 1, weight: 1.0,
      attack: 'body', range: 26, windup: 0.55, strike: 0.16, recover: 0.62,
      damage: 12, lunge: 62,
    },
    demonz: {
      r: 14, speed: 88, hpMul: 0.65, money: 4, bio: 1, unlockWave: 3, weight: 0.85,
      attack: 'swing', range: 34, windup: 0.42, strike: 0.14, recover: 0.58,
      damage: 9, lunge: 30,
    },
    machinz: {
      r: 19, speed: 44, hpMul: 2.1, money: 7, bio: 2, unlockWave: 6, weight: 0.5,
      attack: 'shoot', range: 320, windup: 0.85, strike: 0.10, recover: 1.6,
      damage: 10, lunge: 0, shotSpeed: 300, keepDist: 235,
    },
  },

  /**
   * 보스 3종 — 스테이지마다 돌아가며 나온다.
   *
   * 셋을 나눈 기준은 체력·피해가 아니라 **플레이어에게 던지는 질문**이다.
   * 숫자만 다른 보스는 새 고민을 만들지 않으므로 기각한다 (설계 기둥 6번).
   *
   *   Sergent  — "붙을까, 뗄까"       근접 압박. 돌진·내려찍기가 거리를 강요한다.
   *   Doc      — "보스냐, 부하냐"     자동 조준이라 부하가 내 탄을 가져간다.
   *   Siren    — "어디에 서서 쏠까"   정지사격 게임에서 멈출 자리를 지운다.
   *
   * 공통 규칙: **모든 패턴의 recover > windup.** 그 차이가 유일한 공략 창이다.
   */
  bosses: [
    {
      id: 'sergent', name: 'SERGENT DUDE', title: '돌격 상사',
      question: '붙을까, 뗄까',
      r: 46, speed: 58, hpBase: 130, hpPerWave: 210, money: 45, bio: 14,
      approachSec: 1.15,
      cycle: ['charge', 'volley', 'slam', 'charge', 'slam', 'volley'],
      patterns: {
        charge: {
          kind: 'charge', windup: 1.00, active: 0.55, recover: 2.00,
          speed: 640, damage: 18,
          tell: '몸을 뒤로 젖힌다 — 옆으로 피해라',
        },
        slam: {
          kind: 'slam', windup: 0.90, active: 0.28, recover: 1.45,
          radius: 158, damage: 16,
          tell: '위로 솟구친다 — 멀어져라',
        },
        volley: {
          // 부채꼴을 넓혔다. 맵 절반 거리면 탄 사이로 걸어 나갈 공간이 생긴다.
          kind: 'volley', windup: 0.95, active: 0.30, recover: 1.20,
          shots: 5, spread: 1.70, damage: 10, shotSpeed: 290,
          tell: '총구를 든다 — 탄 사이로 빠져라',
        },
      },
    },
    {
      id: 'doc', name: 'DOC DUDE', title: '야전 군의관',
      question: '보스를 때릴까, 부하를 정리할까',
      r: 44, speed: 52, hpBase: 150, hpPerWave: 230, money: 55, bio: 18,
      approachSec: 1.30,
      cycle: ['summon', 'volley', 'slam', 'summon', 'charge', 'volley'],
      patterns: {
        summon: {
          // 자동 조준이 약점이 되는 순간. 부하가 살아 있으면 보스에게 딜이 안 들어간다.
          kind: 'summon', windup: 1.20, active: 0.20, recover: 1.80,
          count: 3, damage: 0,
          tell: '팔을 치켜든다 — 부하가 떨어진다',
        },
        volley: {
          kind: 'volley', windup: 1.05, active: 0.30, recover: 1.35,
          shots: 4, spread: 1.55, damage: 9, shotSpeed: 265,
          tell: '총구를 든다 — 탄 사이로 빠져라',
        },
        slam: {
          kind: 'slam', windup: 1.00, active: 0.26, recover: 1.55,
          radius: 138, damage: 14,
          tell: '위로 솟구친다 — 멀어져라',
        },
        charge: {
          kind: 'charge', windup: 1.10, active: 0.50, recover: 1.95,
          speed: 560, damage: 15,
          tell: '몸을 뒤로 젖힌다 — 옆으로 피해라',
        },
      },
    },
    {
      id: 'siren', name: 'SIREN DUDE', title: '포격 관제',
      question: '어디에 서서 쏠까',
      r: 42, speed: 66, hpBase: 140, hpPerWave: 220, money: 60, bio: 20,
      approachSec: 1.00,
      cycle: ['beam', 'spiral', 'charge', 'beam', 'spiral', 'slam'],
      patterns: {
        beam: {
          // 예고선이 길게 깔린다. 보스는 움직이지 않으므로 선 밖으로 걸어 나가면 된다.
          // 대신 예고가 길어서, 그 시간을 딜로 쓸지 회피로 쓸지 고민이 생긴다.
          kind: 'beam', windup: 1.30, active: 0.35, recover: 1.90,
          width: 34, length: 760, damage: 20,
          tell: '조준선을 긋는다 — 선 밖으로',
        },
        spiral: {
          // 회전 난사. 탄 사이 간격이 곧 안전 통로다. 서 있으면 반드시 맞는다.
          kind: 'spiral', windup: 1.05, active: 0.90, recover: 1.55,
          shots: 14, turn: 3.1, damage: 8, shotSpeed: 240,
          tell: '팽이처럼 돈다 — 계속 움직여라',
        },
        charge: {
          kind: 'charge', windup: 0.95, active: 0.55, recover: 1.80,
          speed: 680, damage: 16,
          tell: '몸을 뒤로 젖힌다 — 옆으로 피해라',
        },
        slam: {
          kind: 'slam', windup: 0.85, active: 0.26, recover: 1.40,
          radius: 150, damage: 15,
          tell: '위로 솟구친다 — 멀어져라',
        },
      },
    },
  ],

  // --- 웨이브 편성 ---
  // 시간이 흘러서 적이 나오는 게 아니라, 정해진 수를 다 잡아야 다음 웨이브가 온다.
  // 그래서 난이도 곡선은 스폰 압력이 아니라 "웨이브당 적 수" 가 담당한다.
  wavesPerStage: 4,           // 4번째는 항상 보스
  waveBaseCount: 5,
  waveGrowth: 1.19,
  // 자동 조준이라 적을 골라 겨냥할 수 없다. 그래서 동시에 3~4마리가 몰리면
  // 플레이어가 개입할 여지가 사라지고 답답해진다.
  // 웨이브를 '그룹' 으로 쪼개고, 앞 그룹이 거의 정리돼야 다음 그룹을 내보낸다.
  groupClearAt: 1,            // 살아 있는 적이 이 수 이하로 줄면 다음 그룹 투입
  groupTimeout: 9,            // 정리를 못 해도 이 시간이 지나면 다음 그룹 (교착 방지)
  groupGap: 0.7,              // 그룹 투입 직전의 짧은 뜸
  groupSpawnGap: 0.30,        // 한 그룹 안에서 개체가 나오는 간격
  groupMaxLate: 4,            // 후반 자동 편성의 그룹 최대 크기
  maxAliveEnemies: 40,
  intermissionSec: 1.6,       // 웨이브 사이 숨 돌리는 시간
  stageClearSec: 2.9,         // 보스 처치 → 수송선 → 상점. 보상 전에 한 박자 쉰다
  deathCineSec: 2.0,          // 사망 슬로우모션. 왜 죽었는지 볼 시간을 준다
};

// 하위 호환 — 기존 코드가 참조하던 단수 boss 는 1번 보스를 가리킨다.
B.boss = B.bosses[0];

/** 스테이지 n 에 나오는 보스 정의. 스테이지가 돌면 보스도 돌아간다. */
function bossForStage(stage, b = B) {
  const i = (Math.max(1, Math.floor(stage)) - 1) % b.bosses.length;
  return b.bosses[i];
}

/** 웨이브 n 의 적 1마리 기본 체력 (종족 배율 적용 전). */
function enemyHp(wave, b = B) {
  return b.enemyBaseHp * (1 + b.enemyHpGrowthPerWave * Math.max(0, Math.floor(wave) - 1));
}

/**
 * 웨이브 n 에서 적이 주는 피해.
 * 체력만 올리고 피해를 고정하면 후반에 적이 "때리지 못하는 샌드백" 이 된다.
 * 그러면 죽지 않으므로 긴장이 사라진다.
 */
function enemyDamage(wave, base, b = B) {
  return base * (1 + b.enemyDamageGrowthPerWave * Math.max(0, Math.floor(wave) - 1));
}

/** 그 웨이브에 등장 가능한 적 종류. 원거리 적은 한참 뒤에야 풀린다. */
function availableKinds(wave, b = B) {
  return Object.keys(b.kinds).filter((k) => Math.floor(wave) >= b.kinds[k].unlockWave);
}

/**
 * 웨이브 편성 — 그룹의 나열.
 *
 * 초반 여섯 웨이브는 손으로 짰다. 규칙을 하나씩 가르치기 위해서다:
 *   W1 [1,1,2] — 한 마리가 다가온다. 가만히 있으면 쏜다. 움직이면 못 쏜다.
 *                두 번째도 한 마리. 이제 규칙을 안다. 그리고 갑자기 둘이 온다.
 *   W2 [2,2,2] — 둘이 기본이 된다. 탄이 모자란다. 도망치며 장전하는 법을 배운다.
 *   W3 [1,2,3] — 빠른 적(Demonz)이 섞인다. 셋을 처음 만난다.
 * 그 뒤로는 총량을 자동으로 쪼갠다.
 */
const HAND_AUTHORED = {
  1: [1, 1, 2],
  2: [2, 2, 2],
  3: [1, 2, 3],
  5: [2, 3, 3],
  6: [3, 3, 3, 2],
  7: [3, 4, 4, 3],
};

function waveGroups(n, b = B) {
  const w = Math.max(1, Math.floor(n));
  if (isBossWave(w, b)) return [];
  if (HAND_AUTHORED[w]) return [...HAND_AUTHORED[w]];

  // 자동 편성: 총량을 3~4 크기의 그룹으로 쪼갠다. 한 번에 다 쏟지 않는다.
  const idx = w - Math.floor((w - 1) / b.wavesPerStage) - 1;
  const total = Math.ceil(b.waveBaseCount * Math.pow(b.waveGrowth, idx));
  const groups = [];
  let left = total;
  let size = 3;
  while (left > 0) {
    const g = Math.min(left, size);
    groups.push(g);
    left -= g;
    size = Math.min(b.groupMaxLate, size + (groups.length % 2 === 0 ? 1 : 0));
  }
  return groups;
}

/** 웨이브 n 의 총 적 수. 보스 웨이브는 0. */
function waveCount(n, b = B) {
  return waveGroups(n, b).reduce((s, g) => s + g, 0);
}

/** 그 웨이브가 보스 웨이브인가 — 스테이지의 마지막 웨이브다. */
function isBossWave(n, b = B) {
  return Math.floor(n) % b.wavesPerStage === 0;
}

/** 웨이브 n 이 속한 스테이지 (1부터). */
function stageOf(n, b = B) {
  return Math.floor((Math.max(1, Math.floor(n)) - 1) / b.wavesPerStage) + 1;
}

/** 스테이지 안에서 몇 번째 웨이브인가 (1..wavesPerStage). */
function waveInStage(n, b = B) {
  return ((Math.max(1, Math.floor(n)) - 1) % b.wavesPerStage) + 1;
}

/** 보스 체력 — 스테이지가 올라갈수록 두꺼워진다. 보스마다 기본값이 다르다. */
function bossHp(wave, b = B) {
  const stage = stageOf(wave, b);
  const def = bossForStage(stage, b);
  return def.hpBase + def.hpPerWave * (stage - 1);
}

/** 적 한 마리를 죽이는 데 필요한 탄 수 — "잘 안 죽는다" 를 확인하는 지표. */
function shotsToKill(wave, kind, shot, b = B) {
  const hp = enemyHp(wave, b) * b.kinds[kind].hpMul;
  return Math.ceil(hp / (shot.damage * shot.count));
}

/* ─────────── src/core/meta.js ─────────── */
/**
 * 메타 성장 — 생명에너지로 배우는 유전자 트리.
 *
 * 【v2 재설계】 세 가지가 바뀌었다.
 *
 *  1. **노드마다 단계가 다르다.** 스탯은 3~5단계, 기능 해금은 1단계다.
 *     기능 해금은 "있냐 없냐" 의 문제라 단계를 나눌 게 없다.
 *     스탯은 조금씩 오르는 맛이 진행감이므로 잘게 쪼갠다.
 *
 *  2. **단계가 오를수록 값이 뛴다.** 1단계는 한 판이면 사고, 5단계는 한참 모아야 한다.
 *     싼 단계가 앞에 있어야 "한 판 하면 뭐라도 하나는 산다" (설계 기둥 4번) 가 지켜진다.
 *
 *  3. **안 배운 앞길은 보이지 않는다.** 이전 노드를 배워야 다음이 드러난다.
 *     25개를 한 번에 보여 주면 고르는 게 아니라 훑는 게 된다.
 *     한 번에 보이는 선택지는 많아야 대여섯이어야 한다.
 *
 * 배치는 중앙 '각성' 에서 동서남북 네 갈래:
 *   북 — 기본 스펙 · 동 — 총기 이해 · 남 — 폭탄 · 서 — 자원 획득
 *
 * 이 게임의 진행감 전체가 이 트리에 있다. 런 안에서는 아무것도 강해지지 않는다.
 * 전부 순수 함수다.
 */

const BRANCH = {
  spec:  { name: '기본 스펙',   color: '#D9534F', desc: '몸 자체를 개조한다' },
  gun:   { name: '총기 이해',   color: '#4E8FBF', desc: '총을 더 잘 다룬다' },
  bomb:  { name: '폭탄',        color: '#E8A33D', desc: '충격파를 키운다' },
  loot:  { name: '자원 획득',   color: '#5FA36A', desc: '더 많이 챙긴다' },
};

/** 단계 비용 곡선 — 1단계는 싸고, 올라갈수록 가파르다. */
const COST_GROWTH = 1.75;

/**
 * 노드 정의.
 *  g    : 격자 좌표 [x, y] — 중앙이 (0,0)
 *  req  : 이 노드가 드러나려면 배워야 하는 노드
 *  max  : 최대 단계
 *  base : 1단계 비용. 다음 단계는 COST_GROWTH 배씩
 *  kind : 'stat'(단계형) | 'unlock'(1단계 기능 해금)
 *  eff  : **단계당** 효과. 3단계면 세 번 적용된다
 */
const NODES = [
  // 첫 화면에는 이것 하나뿐이다. 이걸 사야 나머지가 드러난다.
  // 공짜로 주면 "당한 것에서 하는 것으로" 바뀌는 그 전환이 아무 의미도 없다.
  { id: 'root', branch: null, g: [0, 0], req: null, max: 1, base: 3, kind: 'unlock',
    name: '각성', eff: {}, unit: '유전자 조작을 시작한다',
    long: '마취가 풀렸다. 실험대에서 내려온다. 놈들이 내 몸에 무슨 짓을 했는지는 모른다. '
        + '다만 이제 — 내가 직접 한다.' },

  /* ================= 북: 기본 스펙 ================= */
  { id: 'sp1', branch: 'spec', g: [0, -1], req: 'root', max: 5, base: 4, kind: 'stat',
    name: '근육 섬유', eff: { dmg: 1.12 }, unit: '피해 +12%',
    long: '팔에 놈들의 조직을 엮어 넣었다. 두 발에 쓰러지느냐 다섯 발에 쓰러지느냐 — '
        + '그 차이가 목숨이다.' },
  { id: 'sp2', branch: 'spec', g: [0, -2], req: 'sp1', max: 5, base: 5, kind: 'stat',
    name: '두꺼운 표피', eff: { hp: 6 }, unit: '최대 체력 +6',
    long: '살가죽이 짐승 쪽으로 한 걸음 갔다. 한 대 더 맞고 버틴다. '
        + '초반에는 그 한 대가 스테이지 하나를 가른다.' },
  { id: 'sp3', branch: 'spec', g: [-1, -3], req: 'sp2', max: 3, base: 9, kind: 'stat',
    name: '경련 반사', eff: { spd: 1.05 }, unit: '이동 속도 +5%',
    long: '신경이 제멋대로 앞서 움직인다. 빨리 피하면 빨리 멈춰 설 수 있다. '
        + '이 섬에서는 서 있는 시간이 곧 쏘는 시간이다.' },
  { id: 'sp4', branch: 'spec', g: [1, -3], req: 'sp2', max: 4, base: 12, kind: 'stat',
    name: '연골 갑피', eff: { dr: 0.05 }, unit: '받는 피해 −5%',
    long: '뼈 위에 한 겹을 더 앉혔다. 맷집이 느는 것과는 다르다. '
        + '큰 한 방이 들어올 때 그 한 방을 깎는다.' },
  { id: 'sp6', branch: 'spec', g: [-1, -4], req: 'sp3', max: 3, base: 26, kind: 'stat',
    name: '과부하 심장', eff: { dmg: 1.18 }, unit: '피해 +18%',
    long: '심장이 두 배로 뛴다. 오래 쓰면 무엇이 남을지 모르겠다. '
        + '어차피 오래 쓸 생각도 없다.' },
  { id: 'sp5', branch: 'spec', g: [1, -4], req: 'sp4', max: 1, base: 60, kind: 'unlock',
    name: '재생 조직', eff: { lifesteal: 2 }, unit: '적을 죽일 때마다 체력 +2',
    long: '쓰러뜨린 것의 조직이 내 상처를 메운다. 도망치는 대신 맞설 수 있게 됐다. '
        + '살아남으려면 죽여야 한다 — 이제 그게 문장 그대로다.' },

  /* ================= 동: 총기 이해 ================= */
  { id: 'gn1', branch: 'gun', g: [1, 0], req: 'root', max: 5, base: 4, kind: 'stat',
    name: '방아쇠 감각', eff: { itv: 0.94 }, unit: '발사 간격 −6%',
    long: '손가락이 생각보다 빠르다. 같은 시간을 서 있어도 더 많이 나간다. '
        + '용병 시절에도 이 정도는 아니었다.' },
  { id: 'gn2', branch: 'gun', g: [2, 0], req: 'gn1', max: 4, base: 6, kind: 'stat',
    name: '탄창 숙련', eff: { rld: 0.90 }, unit: '재장전 −10%',
    long: '보지 않고 갈아 끼운다. 재장전은 뛰면서도 돌아간다 — '
        + '짧아질수록 도망치는 시간이 짧아진다.' },
  { id: 'gn3', branch: 'gun', g: [3, -1], req: 'gn2', max: 3, base: 10, kind: 'stat',
    name: '총열 연장', eff: { rng: 1.15 }, unit: '사거리 +15%',
    long: '멀리서 시작할 수 있으면 그만큼 덜 위험한 자리에 서 있어도 된다. '
        + '이 절벽에서는 한 걸음이 전부다.' },
  { id: 'gn4', branch: 'gun', g: [3, 1], req: 'gn2', max: 3, base: 8, kind: 'stat',
    name: '고압 장약', eff: { kb: 1.35 }, unit: '탄 넉백 +35%',
    long: '탄이 놈들을 뒤로 밀어낸다. 죽이지 못해도 시간을 산다. '
        + '여기서는 시간이 피해보다 비싸다.' },
  { id: 'gn6', branch: 'gun', g: [4, -1], req: 'gn3', max: 3, base: 24, kind: 'stat',
    name: '속사 훈련', eff: { itv: 0.92 }, unit: '발사 간격 −8%',
    long: '방아쇠 감각 위에 겹친다. 둘을 다 올리면 손이 총을 앞질러 간다.' },
  { id: 'gn5', branch: 'gun', g: [4, 1], req: 'gn4', max: 1, base: 70, kind: 'unlock',
    name: '철갑탄', eff: { pierce: 1 }, unit: '모든 탄이 1명 더 관통',
    long: '줄지어 오는 놈들을 한 발로 꿴다. 이제 놈들이 몇 마리인지가 아니라 '
        + '어떤 줄로 오는지를 본다.' },

  /* ================= 남: 폭탄 ================= */
  { id: 'bm1', branch: 'bomb', g: [0, 1], req: 'root', max: 5, base: 5, kind: 'stat',
    name: '기폭 회로', eff: { skCd: 0.90 }, unit: '충격파 대기 −10%',
    long: '가슴에 심은 것이 다시 차오르는 데 걸리는 시간. 한 판에 한 번이던 것이 '
        + '두 번이 되고 세 번이 된다.' },
  { id: 'bm2', branch: 'bomb', g: [0, 2], req: 'bm1', max: 4, base: 7, kind: 'stat',
    name: '확산 장약', eff: { skR: 1.20 }, unit: '충격파 범위 +20%',
    long: '처음엔 발밑만 겨우 쓸어냈다. 이 반경이 곧 내가 숨 쉴 수 있는 넓이다.' },
  { id: 'bm3', branch: 'bomb', g: [-1, 3], req: 'bm2', max: 4, base: 9, kind: 'stat',
    name: '고폭 탄두', eff: { skDmg: 1.35 }, unit: '충격파 피해 +35%',
    long: '밀어내던 것이 죽이는 것으로 바뀌는 지점이 있다. 여기가 그 지점이다.' },
  { id: 'bm4', branch: 'bomb', g: [1, 3], req: 'bm2', max: 3, base: 8, kind: 'stat',
    name: '충격 증폭', eff: { skKb: 1.30 }, unit: '밀치는 힘 +30%',
    long: '죽이지 못해도 벼랑까지 밀어낼 수 있다. 이 섬에서 가장 잘 드는 무기는 낭떠러지다.' },
  { id: 'bm6', branch: 'bomb', g: [-1, 4], req: 'bm3', max: 3, base: 22, kind: 'stat',
    name: '축전기', eff: { skCd: 0.88 }, unit: '충격파 대기 −12%',
    long: '기폭 회로 위에 겹친다. 겹칠수록 기다리는 시간이 눈에 띄게 줄어든다.' },
  { id: 'bm5', branch: 'bomb', g: [1, 4], req: 'bm4', max: 1, base: 80, kind: 'unlock',
    name: '이중 기폭', eff: { charges: 1 }, unit: '충격파를 2회까지 모아 둔다',
    long: '두 발을 품고 다닌다. 처음으로 아낄 이유가 생겼다 — '
        + '한 발뿐일 때는 아낄 이유가 없었으니까.' },

  /* ================= 서: 자원 획득 ================= */
  { id: 'lt1', branch: 'loot', g: [-1, 0], req: 'root', max: 4, base: 4, kind: 'stat',
    name: '전리품 감각', eff: { money: 1.15 }, unit: '돈 획득 +15%',
    long: '시설 물자가 어디 떨어졌는지 눈에 밟힌다. 섬을 벗어나면 종잇조각이지만, '
        + '벗어나기 전까지는 총을 사 준다.' },
  { id: 'lt2', branch: 'loot', g: [-2, 0], req: 'lt1', max: 4, base: 5, kind: 'stat',
    name: '조직 채취', eff: { bio: 1.15 }, unit: '유전자 조각 +15%',
    long: '뜯는 손이 정확해졌다. 같은 시체에서 더 많이 나온다. '
        + '이게 다음 판을 앞당기는 유일한 길이다.' },
  { id: 'lt3', branch: 'loot', g: [-3, -1], req: 'lt2', max: 3, base: 10, kind: 'stat',
    name: '비상 자금', eff: { startMoney: 25 }, unit: '판 시작 시 돈 +25',
    long: '주머니에 넣어 두고 시작한다. 첫 보급소에서 살 수 있는 게 달라진다.' },
  { id: 'lt4', branch: 'loot', g: [-3, 1], req: 'lt2', max: 1, base: 45, kind: 'unlock',
    name: '촉수 감각', eff: { magnet: 1 }, unit: '유전자 조각을 멀리서 끌어당긴다',
    long: '조각은 걸어가서 손으로 뜯어야 한다. 뜯는 동안은 총을 못 쏜다 — 그게 값이다. '
        + '이걸 배우면 몸이 알아서 끌어당긴다. 그만큼 나는 덜 사람이 된다.' },
  { id: 'lt5', branch: 'loot', g: [-4, 1], req: 'lt4', max: 3, base: 30, kind: 'stat',
    name: '흡인장', eff: { magR: 1.20 }, unit: '끌어당기는 범위 +20%',
    long: '더 멀리까지 딸려온다. 다만 절벽 전체를 덮지는 못한다. '
        + '어디에 설지는 끝까지 내가 고른다.' },
  { id: 'lt6', branch: 'loot', g: [-4, -1], req: 'lt3', max: 3, base: 26, kind: 'stat',
    name: '포식자', eff: { money: 1.15, bio: 1.15 }, unit: '돈·조각 +15%',
    long: '쓰러진 것에서 남길 게 없을 때까지 가져간다. 죄책감은 실험대에 두고 왔다.' },
  { id: 'lt7', branch: 'loot', g: [-5, 1], req: 'lt5', max: 3, base: 12, kind: 'stat',
    name: '손끝 감각', eff: { pickR: 8 }, unit: '줍는 반경 +8',
    long: '스치기만 해도 뜯긴다. 발을 정확히 얹지 않아도 되니 그만큼 덜 멈춘다.' },
  { id: 'lt8', branch: 'loot', g: [-5, -1], req: 'lt6', max: 3, base: 16, kind: 'stat',
    name: '조직 보존', eff: { shardLife: 2.5 }, unit: '조각이 남아 있는 시간 +2.5초',
    long: '조직이 늦게 삭는다. 지금 갈지 나중에 갈지를 고를 여유가 생긴다 — '
        + '그 여유가 곧 목숨이다.' },
];

const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

/* ------------------------------------------------------------------ 비용 */

/**
 * 노드의 `level` 단계(1부터)를 사는 값.
 * 1단계는 base, 그 뒤로 COST_GROWTH 배씩. 싼 앞단계가 있어야 한 판의 보상이 살아난다.
 */
function stepCost(node, level) {
  const n = typeof node === 'string' ? NODE_BY_ID[node] : node;
  if (!n || level < 1 || level > n.max) return Infinity;
  return Math.max(1, Math.round(n.base * COST_GROWTH ** (level - 1)));
}

/** 그 노드를 끝까지 올리는 총액. */
function nodeTotalCost(node) {
  const n = typeof node === 'string' ? NODE_BY_ID[node] : node;
  if (!n) return 0;
  let s = 0;
  for (let i = 1; i <= n.max; i += 1) s += stepCost(n, i);
  return s;
}

/** 트리를 전부 배우는 데 드는 생명에너지 — 진행 곡선의 끝점. */
function totalCost() {
  return NODES.reduce((s, n) => s + nodeTotalCost(n), 0);
}

/* ------------------------------------------------------------ 습득 상태 */

/**
 * 세이브의 습득 상태를 항상 유효한 모양으로 정규화한다. 절대 throw 하지 않는다.
 * 반환은 `{ id: level }` 맵이다. 예전 배열 형태(v5)도 받아 준다.
 */
function normalizeOwned(raw) {
  // 【v3】 각성(root)도 배워야 한다. 자동으로 채워 주지 않는다.
  // 첫 화면에 노드가 하나뿐이고, 그것을 사면 넷이 드러나는 경험을 만들기 위해서다.
  const out = {};
  if (Array.isArray(raw)) {
    // v5 형태 — 배운 노드의 id 배열. 전부 1단계로 본다.
    for (const id of raw) if (typeof id === 'string' && NODE_BY_ID[id]) out[id] = 1;
  } else if (raw && typeof raw === 'object') {
    for (const [id, lv] of Object.entries(raw)) {
      const n = NODE_BY_ID[id];
      if (!n) continue;
      const v = Math.floor(Number(lv));
      if (Number.isFinite(v) && v > 0) out[id] = Math.min(n.max, v);
    }
  }
  // 선행 노드가 빠져 있으면 잘라낸다 (세이브 오염 방어)
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Object.keys(out)) {
      const n = NODE_BY_ID[id];
      if (n?.req && !(out[n.req] > 0)) { delete out[id]; changed = true; }
    }
  }
  return out;
}

/** 지금 배운 단계 (0 = 아직 안 배움). */
function levelOf(id, owned) {
  return normalizeOwned(owned)[id] ?? 0;
}

/**
 * 화면에 **보여도 되는가.**
 * 이전 노드를 배워야 다음이 드러난다. 안 그러면 한눈에 25개가 쏟아진다.
 */
function isRevealed(id, owned) {
  const own = normalizeOwned(owned);
  const n = NODE_BY_ID[id];
  if (!n) return false;
  if (own[id] > 0) return true;
  return !n.req || own[n.req] > 0;
}

/** 지금 화면에 그릴 노드들. */
function revealedNodes(owned) {
  const own = normalizeOwned(owned);
  return NODES.filter((n) => isRevealed(n.id, own));
}

/** 다음 단계를 살 수 있는가 (돈은 보지 않는다). */
function canLearn(id, owned) {
  const own = normalizeOwned(owned);
  const n = NODE_BY_ID[id];
  if (!n) return false;
  if ((own[id] ?? 0) >= n.max) return false;
  return isRevealed(id, own);
}

/** 다음 단계의 값. 이미 만렙이면 Infinity. */
function nextCost(id, owned) {
  const n = NODE_BY_ID[id];
  if (!n) return Infinity;
  const lv = levelOf(id, owned);
  if (lv >= n.max) return Infinity;
  return stepCost(n, lv + 1);
}

/** 습득 시도. 순수 함수 — 새 상태를 돌려주고 인자를 건드리지 않는다. */
function learnNode(id, bio, owned) {
  const own = normalizeOwned(owned);
  const n = NODE_BY_ID[id];
  if (!n) return { ok: false, bio, owned: own, reason: 'unknown' };
  const lv = own[id] ?? 0;
  if (lv >= n.max) return { ok: false, bio, owned: own, reason: 'max' };
  if (!canLearn(id, own)) return { ok: false, bio, owned: own, reason: 'locked' };
  const cost = stepCost(n, lv + 1);
  if (bio < cost) return { ok: false, bio, owned: own, reason: 'poor' };
  return { ok: true, bio: bio - cost, owned: { ...own, [id]: lv + 1 }, spent: cost };
}

/* --------------------------------------------------------------- 스탯 */

/**
 * 습득 상태 → 실제 전투 스탯.
 * 런타임·시뮬레이터·테스트가 전부 이 함수 하나만 본다.
 * 단계형 노드의 효과는 **단계 수만큼 반복 적용**된다.
 */
function deriveStats(owned, b = B) {
  const own = normalizeOwned(owned);
  const m = {
    dmg: 1, hp: 0, spd: 1, dr: 0,
    itv: 1, rld: 1, rng: 1, kb: 1,
    skCd: 1, skR: 1, skDmg: 1, skKb: 1,
    money: 1, bio: 1, startMoney: 0,
    lifesteal: 0, pierce: 0, charges: 0, magnet: 0, magR: 1,
    pickR: 0, shardLife: 0,
  };
  for (const [id, lv] of Object.entries(own)) {
    const e = NODE_BY_ID[id]?.eff ?? {};
    for (let i = 0; i < lv; i += 1) {
      for (const k of Object.keys(e)) {
        if (k === 'hp' || k === 'startMoney' || k === 'lifesteal'
            || k === 'pierce' || k === 'charges' || k === 'magnet'
            || k === 'pickR' || k === 'shardLife') m[k] += e[k];
        else if (k === 'dr') m.dr = 1 - (1 - m.dr) * (1 - e.dr);   // 감소율은 곱연산
        else m[k] *= e[k];
      }
    }
  }
  // 각성도 배우는 것이므로 습득 단계에 센다. 첫 구매가 화면에 반영되어야 한다.
  const learned = Object.values(own).reduce((s, lv) => s + lv, 0);
  return {
    damage: b.baseDamage * m.dmg,
    fireInterval: Math.max(0.09, b.fireIntervalBase * m.itv),
    reloadMul: m.rld,
    rangeMul: m.rng,
    knockMul: m.kb,
    maxHp: b.playerMaxHp + m.hp,
    speed: b.playerSpeed * m.spd,
    damageReduction: Math.min(0.6, m.dr),
    skillCooldown: Math.max(7, b.skillCooldown * m.skCd),
    skillRadius: b.skillRadius * m.skR,
    skillDamageMul: b.skillDamageMul * m.skDmg,
    skillKnockback: b.skillKnockback * m.skKb,
    moneyMul: m.money,
    bioMul: m.bio,
    startMoney: m.startMoney,
    // --- 기능 해금 ---
    lifesteal: m.lifesteal,                     // 처치당 회복량
    bonusPierce: m.pierce,                      // 모든 탄의 추가 관통
    skillCharges: 1 + m.charges,                // 충격파 보유 가능 수
    magnetRadius: Math.min(b.magnetCapR, (m.magnet > 0 ? b.magnetUnlockedR : b.magnetBaseR) * m.magR),
    pickupRadius: b.pickupR + m.pickR,          // 손으로 뜯는 반경
    shardLife: b.shardLife + m.shardLife,       // 조각이 버티는 시간
    owned: own,
    learned,
  };
}

/**
 * 능력 총합 화면이 읽는 표.
 * 기본값과 현재값을 나란히 놓는다 — 무엇이 얼마나 늘었는지가 숫자 하나로는 안 보인다.
 */
function statSummary(owned, b = B) {
  const s = deriveStats(owned, b);
  const base = deriveStats({}, b);
  const rows = [
    ['spec', '피해', base.damage, s.damage, (v) => v.toFixed(1)],
    ['spec', '최대 체력', base.maxHp, s.maxHp, (v) => Math.round(v)],
    ['spec', '이동 속도', base.speed, s.speed, (v) => Math.round(v)],
    ['spec', '받는 피해 감소', base.damageReduction, s.damageReduction, (v) => `${Math.round(v * 100)}%`],
    ['gun', '발사 간격', base.fireInterval, s.fireInterval, (v) => `${v.toFixed(2)}초`],
    ['gun', '재장전 배율', base.reloadMul, s.reloadMul, (v) => `×${v.toFixed(2)}`],
    ['gun', '사거리 배율', base.rangeMul, s.rangeMul, (v) => `×${v.toFixed(2)}`],
    ['gun', '탄 넉백', base.knockMul, s.knockMul, (v) => `×${v.toFixed(2)}`],
    ['bomb', '충격파 대기', base.skillCooldown, s.skillCooldown, (v) => `${v.toFixed(0)}초`],
    ['bomb', '충격파 범위', base.skillRadius, s.skillRadius, (v) => Math.round(v)],
    ['bomb', '충격파 피해', base.skillDamageMul, s.skillDamageMul, (v) => `×${v.toFixed(2)}`],
    ['bomb', '밀치는 힘', base.skillKnockback, s.skillKnockback, (v) => Math.round(v)],
    ['loot', '돈 획득', base.moneyMul, s.moneyMul, (v) => `×${v.toFixed(2)}`],
    ['loot', '조각 획득', base.bioMul, s.bioMul, (v) => `×${v.toFixed(2)}`],
    ['loot', '시작 자금', base.startMoney, s.startMoney, (v) => Math.round(v)],
    ['loot', '조각 흡인 범위', base.magnetRadius, s.magnetRadius, (v) => Math.round(v)],
    ['loot', '줍는 반경', base.pickupRadius, s.pickupRadius, (v) => Math.round(v)],
    ['loot', '조각 지속 시간', base.shardLife, s.shardLife, (v) => `${v.toFixed(1)}초`],
  ].map(([branch, label, b0, b1, fmt]) => ({
    branch, label, base: fmt(b0), now: fmt(b1), changed: Math.abs(b1 - b0) > 1e-9,
  }));

  const unlocks = NODES
    .filter((n) => n.kind === 'unlock' && n.id !== 'root' && (s.owned[n.id] ?? 0) > 0)
    .map((n) => ({ branch: n.branch, name: n.name, unit: n.unit }));

  return { rows, unlocks, learned: s.learned, stats: s };
}

/** v4 의 트랙 레벨을 트리 노드로 옮긴다. 진행이 사라지면 안 된다. */
function migrateFromTracks(upgrades) {
  const map = {
    power: 'sp1', rate: 'gn1', vigor: 'sp2', swift: 'sp3', shock: 'bm1',
  };
  const owned = {};
  for (const [k, id] of Object.entries(map)) {
    const lv = Math.max(0, Math.floor(Number(upgrades?.[k]) || 0));
    if (lv > 0) owned[id] = Math.min(NODE_BY_ID[id].max, lv);
  }
  // 각성은 **진행이 있던 사람에게만** 이어 준다.
  // 아무것도 안 배운 옛 세이브에 각성을 공짜로 얹으면 첫 구매의 의미가 사라진다.
  if (Object.keys(owned).length > 0) owned.root = 1;
  return normalizeOwned(owned);
}

/**
 * v5 의 노드 배열(전부 1단계)을 단계형으로 옮긴다.
 * 없어진 노드(sp5·gn5·bm5·lt5 의 옛 뜻)는 같은 갈래의 대표 노드로 흡수한다 —
 * 진행이 통째로 사라지는 것보다 낫다.
 */
function migrateFromFlatTree(ownedArray) {
  // v4 → v5 단계가 이미 맵을 만들어 넘겼을 수 있다. 그때는 그대로 통과시킨다.
  // (배열로만 받으면 v3 이하에서 올라온 진행이 통째로 사라진다 — 실제로 났던 버그다)
  // 각성은 배워야 하는 것으로 바뀌었지만, **이미 진행한 사람에게서 뺏지 않는다.**
  if (ownedArray && !Array.isArray(ownedArray) && typeof ownedArray === 'object') {
    const has = Object.values(ownedArray).some((v) => Number(v) > 0);
    return normalizeOwned(has ? { root: 1, ...ownedArray } : {});
  }
  const out = {};
  const absorb = { spec: 'sp1', gun: 'gn1', bomb: 'bm1', loot: 'lt1' };
  if (Array.isArray(ownedArray) && ownedArray.length > 0) out.root = 1;
  if (Array.isArray(ownedArray)) {
    for (const id of ownedArray) {
      if (id === 'root') continue;
      const n = NODE_BY_ID[id];
      if (n) { out[id] = Math.max(out[id] ?? 0, 1); continue; }
      // 사라진 노드 — 갈래를 알 수 있으면 그 갈래의 첫 노드를 한 단계 올려 준다
      const br = Object.keys(absorb).find((k) => id.startsWith(k.slice(0, 2)));
      if (br) {
        const t = absorb[br];
        out[t] = Math.min(NODE_BY_ID[t].max, (out[t] ?? 0) + 1);
      }
    }
  }
  return normalizeOwned(out);
}

/* ─────────── src/core/weapons.js ─────────── */
/**
 * 무기 — 인게임 상점에서 고르는 전투 스타일.
 *
 * 【화기 전문가 검수 반영】
 * 이전 목록의 '분열탄'·'쌍열총' 은 실존하지 않는 형태라 폐기했다.
 * 실제 총기 계열을 archetype 으로 쓰고, 그 계열이 실제로 갖는 트레이드오프를 파라미터로 옮겼다.
 *
 * 조작은 버튼 하나 늘지 않는다. 대신 총이 가진 진짜 제약이 판단을 만든다:
 *
 *  1. 탄창 · 재장전 — 탄이 떨어지면 자동으로 재장전한다. 재장전은 **이동 중에도 진행된다**.
 *     그래서 최적 플레이는 "탄 다 쓰고 → 움직이며 재장전 → 멈춰서 다시 사격" 의 리듬이 된다.
 *     버튼을 안 늘리고도 "지금 남은 탄으로 저 놈을 잡을 수 있나" 라는 판단이 생긴다.
 *  2. 총구 들림(bloom) — 지속 사격하면 탄착군이 벌어지고, 사격을 멈추면 회복된다.
 *     한 자리에서 무한히 붙잡고 쏘는 것에 자연스러운 상한이 생긴다.
 *  3. 거리 감쇠 — 산탄은 멀면 힘을 잃는다. 유탄은 최소 무장거리 전에는 안 터진다.
 *
 * 파라미터 의미:
 *   mag/reload      장탄수 · 재장전 시간(초)
 *   count/spread    한 번 격발에 나가는 탄 수 · 기본 탄착 퍼짐(rad)
 *   burst/burstGap  점사 발수 · 점사 내 간격(초)
 *   bloom/bloomMax  발당 누적 퍼짐 · 상한
 *   falloff         [시작거리, 끝거리, 최종배율] 거리 감쇠
 *   arm             유탄 신관 무장거리(이 거리 전에는 안 터진다)
 */

const WEAPONS = {
  pistol: {
    id: 'pistol', name: '9mm 권총', tier: 0, price: 0,
    real: '반자동 권총 · 기본 지급품',
    // 연사가 빠르면 "한 발 한 발" 의 무게가 사라진다. 시작 총은 느려야
    // 다가오는 놈을 보며 "이 탄창으로 될까" 를 세게 된다.
    // 사거리도 짧다. 맵 절반도 못 닿으니 놈이 다가올 때까지 기다려야 한다 —
    // 기다리는 그 시간이 이 게임의 첫 긴장이다.
    dmgMul: 0.62, intervalMul: 1.45, count: 1, spread: 0.03, pierce: 1,
    speed: 520, life: 0.42, blast: 0, arm: 0,
    mag: 6, reload: 1.5, burst: 1, burstGap: 0,
    bloom: 0.020, bloomMax: 0.18, falloff: [120, 210, 0.5],
    kick: 5, flash: 0.7, shake: 0.9, muzzle: 36, shape: 'pistol',
    desc: '6발 · 느리고 짧다 · 기본 지급품',
    style: '살아남아서 더 나은 총을 구해라',
  },

  carbine: {
    id: 'carbine', name: '5.56 카빈', tier: 1, price: 16,
    real: 'M4 계열 돌격소총',
    dmgMul: 1.0, intervalMul: 1.0, count: 1, spread: 0.035, pierce: 1,
    speed: 620, life: 1.4, blast: 0, arm: 0,
    mag: 30, reload: 1.6, burst: 1, burstGap: 0,
    bloom: 0.012, bloomMax: 0.16, falloff: null,
    kick: 7, flash: 0.95, shake: 1.2, muzzle: 42, shape: 'rifle',
    desc: '30발 · 재장전 1.6초',
    style: '무난하다. 뭘 해도 중간은 간다',
  },

  smg: {
    id: 'smg', name: '9mm 기관단총', tier: 1, price: 15,
    real: 'MP5 계열 · 권총탄',
    dmgMul: 0.38, intervalMul: 0.30, count: 1, spread: 0.05, pierce: 1,
    speed: 560, life: 0.75, blast: 0, arm: 0,
    mag: 32, reload: 1.5, burst: 1, burstGap: 0,
    bloom: 0.030, bloomMax: 0.34, falloff: [140, 300, 0.45],
    kick: 3, flash: 0.6, shake: 0.5, muzzle: 40, shape: 'smg',
    desc: '32발 · 아주 빠름 · 멀면 약함',
    style: '붙어서 짧게 끊어 쏜다',
  },

  shotgun: {
    id: 'shotgun', name: '12게이지 펌프', tier: 1, price: 17,
    real: '펌프액션 산탄총 · 벅샷 8펠릿',
    dmgMul: 0.30, intervalMul: 1.45, count: 8, spread: 0.40, pierce: 1,
    speed: 450, life: 0.5, blast: 0, arm: 0,
    mag: 6, reload: 2.6, burst: 1, burstGap: 0,
    bloom: 0.02, bloomMax: 0.12, falloff: [90, 240, 0.15],
    kick: 16, flash: 1.6, shake: 3.2, muzzle: 50, shape: 'shotgun',
    desc: '펠릿 8발 · 6발 장전 · 붙어야 강하다',
    style: '적을 끌어들여 코앞에서 터뜨린다',
  },

  burstRifle: {
    id: 'burstRifle', name: '3점사 소총', tier: 2, price: 21,
    real: 'M16A2 · 방아쇠 한 번에 3발',
    dmgMul: 0.55, intervalMul: 1.15, count: 1, spread: 0.02, pierce: 1,
    speed: 660, life: 1.5, blast: 0, arm: 0,
    mag: 30, reload: 1.7, burst: 3, burstGap: 0.075,
    bloom: 0.018, bloomMax: 0.14, falloff: null,
    kick: 6, flash: 0.9, shake: 1.4, muzzle: 43, shape: 'a2',
    desc: '방아쇠 한 번에 3발 · 정확하다',
    style: '짧게 멈춰도 한 뭉치가 나간다',
  },

  dmr: {
    id: 'dmr', name: '지정사수 소총', tier: 2, price: 24,
    real: '반자동 정밀사격 소총 · 7.62',
    dmgMul: 1.85, intervalMul: 1.55, count: 1, spread: 0.006, pierce: 2,
    speed: 820, life: 1.8, blast: 0, arm: 0,
    mag: 20, reload: 2.0, burst: 1, burstGap: 0,
    bloom: 0.010, bloomMax: 0.06, falloff: null,
    kick: 13, flash: 1.2, shake: 2.6, muzzle: 46, shape: 'dmr',
    desc: '한 발이 무겁다 · 2명까지 관통',
    style: '한 발 한 발 값을 매긴다',
  },

  lmg: {
    id: 'lmg', name: '경기관총', tier: 3, price: 26,
    real: '벨트급탄 분대지원화기',
    dmgMul: 0.50, intervalMul: 0.40, count: 1, spread: 0.06, pierce: 1,
    speed: 600, life: 1.5, blast: 0, arm: 0,
    mag: 100, reload: 4.2, burst: 1, burstGap: 0,
    bloom: 0.022, bloomMax: 0.40, falloff: null,
    kick: 5, flash: 1.0, shake: 1.1, muzzle: 44, shape: 'lmg',
    desc: '100발 · 재장전 4.2초 · 오래 쏠수록 흩어진다',
    style: '한 번 자리를 잡으면 오래 버틴다',
  },

  amr: {
    id: 'amr', name: '.50 대물소총', tier: 3, price: 30,
    real: '12.7mm 대물저격총',
    dmgMul: 4.2, intervalMul: 2.9, count: 1, spread: 0.004, pierce: 5,
    speed: 980, life: 2.2, blast: 0, arm: 0,
    mag: 5, reload: 3.2, burst: 1, burstGap: 0,
    bloom: 0.008, bloomMax: 0.04, falloff: null,
    kick: 22, flash: 1.7, shake: 5.0, muzzle: 50, shape: 'amr',
    desc: '5발 · 줄줄이 꿰뚫는다 · 아주 느리다',
    style: '한 발에 모든 걸 건다',
  },

  gl: {
    id: 'gl', name: '40mm 유탄발사기', tier: 3, price: 28,
    real: 'M203 · 저속유탄, 신관 무장거리 있음',
    dmgMul: 1.5, intervalMul: 1.9, count: 1, spread: 0.02, pierce: 1,
    speed: 330, life: 2.0, blast: 84, arm: 95,
    mag: 4, reload: 2.4, burst: 1, burstGap: 0,
    bloom: 0.01, bloomMax: 0.05, falloff: null,
    kick: 11, flash: 1.15, shake: 2.4, muzzle: 40, shape: 'gl',
    desc: '착탄 폭발 · 가까이선 안 터진다(신관 무장거리)',
    style: '뭉친 곳에 던져 넣는다',
  },
};

const WEAPON_IDS = Object.keys(WEAPONS);
const STARTER_WEAPON = 'pistol';

function weaponById(id) {
  return WEAPONS[id] ?? WEAPONS[STARTER_WEAPON];
}

/** 무기를 적용한 실제 사격 제원. 로비 스탯 위에 곱해진다. */
function weaponStats(weaponId, stats) {
  const w = weaponById(weaponId);
  const rng = stats.rangeMul ?? 1;

  // 【실제로 났던 버그】 rangeMul 이 아무 데도 안 쓰이고 있었다.
  // '총열 연장' 을 배워도 사거리가 1px 도 안 늘었다 — 조각만 먹고 아무 일도 안 했다.
  // 사거리는 speed × life 이므로 life 에 곱하고, 감쇠 거리도 같이 밀어 준다.
  const falloff = w.falloff
    ? [w.falloff[0] * rng, w.falloff[1] * rng, w.falloff[2]]
    : null;

  return {
    id: w.id,
    damage: stats.damage * w.dmgMul,
    interval: Math.max(0.09, stats.fireInterval * w.intervalMul),
    knock: (stats.knockMul ?? 1),
    count: w.count, spread: w.spread, pierce: w.pierce,
    speed: w.speed, life: w.life * rng, blast: w.blast, arm: w.arm,
    mag: w.mag, reload: w.reload * (stats.reloadMul ?? 1), burst: w.burst, burstGap: w.burstGap,
    bloom: w.bloom, bloomMax: w.bloomMax, falloff,
    kick: w.kick, flash: w.flash, shake: w.shake, muzzle: w.muzzle,
    /**
     * **탄이 실제로 닿는 거리.** 자동 조준과 화면 표시가 같은 값을 본다.
     * 이 밖의 적은 겨누지 않는다 — 겨누면 탄이 허공에서 사라져
     * "왜 안 맞지" 가 되고, 그건 플레이어 잘못이 아닌 답답함이다.
     */
    range: w.speed * w.life * rng,
    /** 제 위력이 나오는 거리. 감쇠가 없는 총은 사거리 전체가 제 위력이다. */
    effRange: falloff ? falloff[0] : w.speed * w.life * rng,
  };
}

/** 거리에 따른 피해 배율. 감쇠가 없는 총은 항상 1. */
function falloffMul(shot, travelled) {
  if (!shot.falloff) return 1;
  const [a, b, end] = shot.falloff;
  if (travelled <= a) return 1;
  if (travelled >= b) return end;
  return 1 + (end - 1) * ((travelled - a) / (b - a));
}

/**
 * 재장전을 포함한 지속 화력 (발/초 기준 단일 대상 피해).
 * 탄창이 작고 재장전이 길수록 실제 화력이 깎인다 — 표에 안 드러나는 진짜 비용이다.
 */
function sustainedDps(weaponId, stats) {
  const s = weaponStats(weaponId, stats);
  const shotsPerMag = Math.floor(s.mag / Math.max(1, s.burst));
  const cycle = shotsPerMag * s.interval + s.reload;
  const dmgPerMag = shotsPerMag * s.burst * s.count * s.damage;
  return dmgPerMag / cycle;
}

/** 재장전을 뺀 순간 화력 — 짧게 끊어 쏠 때의 체감. */
function burstDps(weaponId, stats) {
  const s = weaponStats(weaponId, stats);
  return (s.damage * s.count * s.burst) / s.interval;
}

/**
 * 상점 후보. 지금 든 무기는 빼고, 웨이브가 올라갈수록 상위 티어가 섞인다.
 * rnd 를 인자로 받으므로 같은 시드면 같은 목록이 나온다.
 */
function rollShop(milestoneIndex, currentWeaponId, rnd, size = 3) {
  const maxTier = Math.min(3, 1 + Math.floor(milestoneIndex / 2));
  const pool = WEAPON_IDS.filter((id) => {
    const w = WEAPONS[id];
    return w.tier >= 1 && w.tier <= maxTier && id !== currentWeaponId;
  });
  const bag = [...pool];
  const take = Math.min(size, bag.length);
  const picked = [];
  while (picked.length < take) {
    const i = Math.floor(rnd() * bag.length) % bag.length;
    picked.push(bag.splice(i, 1)[0]);
  }
  return picked;
}

/* ------------------------------------------------------- 보스 후 상점 편성 */

/**
 * 상점 옵션 — 보스를 잡아야 열린다. 돈(금색)으로 산다.
 *
 * 무기만 팔면 체력이 바닥난 플레이어는 살 이유가 없다.
 * 그래서 "지금 나에게 부족한 것" 을 고를 수 있게 지원 옵션을 섞는다:
 *   당장의 생존(회복) · 앞으로의 생존(최대 체력) · 화력(피해)
 * 무기 교체는 스타일을 바꾸고, 지원 옵션은 지금의 위기를 넘긴다. 그 선택이 상점의 재미다.
 */
function rollShopOptions(stageIndex, world, rnd) {
  const scale = 1 + stageIndex * 0.35;
  const opts = [];

  for (const id of rollShop(stageIndex, world.weapon, rnd, 2)) {
    const w = WEAPONS[id];
    opts.push({
      type: 'weapon', id,
      name: w.name, sub: w.real, desc: w.desc, style: w.style,
      price: Math.ceil(w.price * 1.6 * scale),
    });
  }

  const support = [];
  const p = world.player;
  if (p.hp < p.maxHp * 0.95) {
    support.push({
      type: 'heal', amount: 0.6,
      name: '응급 처치', sub: '현장 봉합',
      desc: '최대 체력의 60% 회복', style: '지금의 위기를 넘긴다',
      price: Math.ceil(20 * scale),
    });
  }
  support.push({
    type: 'maxhp', amount: 0.25,
    name: '근육 이식', sub: '조직 증강',
    desc: '최대 체력 +25% (이번 판 한정)', style: '앞으로를 대비한다',
    price: Math.ceil(34 * scale),
  });
  support.push({
    type: 'power', amount: 0.20,
    name: '탄약 개조', sub: '장약 증량',
    desc: '모든 무기 피해 +20% (이번 판 한정)', style: '더 빨리 죽인다',
    price: Math.ceil(38 * scale),
  });

  // 지원 옵션 2개를 뽑아 총 3~4개로 만든다
  const take = Math.min(2, support.length);
  for (let i = 0; i < take; i += 1) {
    const idx = Math.floor(rnd() * support.length) % support.length;
    opts.push(support.splice(idx, 1)[0]);
  }
  return opts;
}

/* ─────────── src/game/sim.js ─────────── */
/**
 * 게임 시뮬레이션 — 순수 계층.
 * 렌더링·DOM·오디오·SDK 를 일절 모른다. 난수와 스탯은 인자로 받는다.
 *
 * 이 게임의 규칙 세 줄:
 *  1. 멈춰야 쏜다. 움직이면 사격이 끊긴다.
 *  2. 적은 느리게 다가와 눈앞에서 멈춘 채 공격 모션을 취한다. 그때 움직이면 안 맞는다.
 *  3. 그래서 매 순간의 질문은 하나다 — "지금 멈춰서 쏠까, 피할까."
 */

/** 적 이름 — 사망 화면에 "무엇에 당했나" 를 적기 위한 표기. */
const KIND_NAME = Object.freeze({
  boyz: 'Boyz',
  demonz: 'Demonz',
  machinz: 'Machinz',
});

const ST = Object.freeze({
  DROP: 'drop',
  CHASE: 'chase',
  WINDUP: 'windup',
  STRIKE: 'strike',
  RECOVER: 'recover',
  FALL: 'fall',
});

function createWorld(owned = [], b = B) {
  const stats = deriveStats(owned, b);
  const w = {
    b,
    stats,
    weapon: STARTER_WEAPON,
    shot: weaponStats(STARTER_WEAPON, stats),
    t: 0,
    over: false,
    nextId: 1,
    player: {
      x: b.arenaX, y: b.arenaY,
      hp: stats.maxHp, maxHp: stats.maxHp,
      invuln: 0, fireCd: 0, skillCd: 0,
      skillReady: stats.skillCharges,   // 들고 있는 충격파 수 ('이중 기폭' 이 2로 만든다)
      facing: 1, moving: false, hurtFlash: 0,
      walk: 0, lean: 0,
      recoil: 0, recoilA: 0,   // 반동 (거리, 방향)
      aimA: 0,                 // 조준 방향
      firing: 0,               // 발사 직후 잔상 타이머
      mag: weaponStats(STARTER_WEAPON, stats).mag,   // 남은 탄
      reloading: 0,            // 재장전 잔여 시간 — 이동 중에도 진행된다
      bloom: 0,                // 총구 들림 누적 (탄착 퍼짐)
      burstLeft: 0, burstT: 0, // 점사 잔여 발수·간격 타이머
    },
    enemies: [],
    pickups: [],                 // 유전자 조각·보급품. 걸어가서 주워야 한다
    bullets: [],
    hostileShots: [],
    fx: [],
    shock: null,
    shake: 0,
    spawnAcc: 0,
    kills: 0,
    money: stats.startMoney,  // 금색 — 인게임 상점에서 쓴다. 런이 끝나면 사라진다
    bio: 0,                   // 파랑 — 생명에너지. 로비의 유전자 조작에 쓴다. 세이브에 쌓인다
    bioLost: 0,               // 못 줍고 사라진 조각 — 로비가 "얼마를 흘렸나" 를 보여 준다
    supplyTaken: 0,
    supplyStage: 0,           // 보급 웨이브를 뽑아 둔 스테이지
    supplyWave: 0,            // 이번 스테이지에서 보급이 떨어질 웨이브
    damageTaken: 0,
    lastHurt: null,              // 마지막으로 맞은 원인
    killedBy: null,              // 죽인 원인 — 사망 화면이 읽는다
    // --- 웨이브 ---
    // 시간이 아니라 처치로 넘어간다. 다 잡아야 다음이 온다.
    wave: 1,
    waveTotal: waveCount(1, b),
    waveLeft: waveCount(1, b),   // 아직 소환되지 않은 수
    waveKilled: 0,
    groups: waveGroups(1, b),    // 남은 그룹 편성
    groupLeft: 0,                // 지금 투입 중인 그룹의 잔여 개체
    groupTimer: 0,               // 다음 그룹까지의 뜸
    groupAge: 0,                 // 현재 그룹이 나온 뒤 흐른 시간 (교착 방지용)
    spawnTimer: 0,
    intermission: 0,             // >0 이면 다음 웨이브까지 숨 돌리는 중
    bossActive: false,
    shop: null,                  // 보스를 잡으면 열린다
    pendingShop: null,           // 스테이지 클리어 연출이 끝나야 상점이 뜬다
    cine: null,                  // 연출 진행 중 (연출 동안 게임은 멈춘다)
    acquired: [],                // 이번 판에 상점에서 산 것 — 일시정지 화면이 읽는다
    stageIndex: 0,
  };
  w.groupAge = b.groupTimeout;
  w.intermission = 0.9;   // 시작 직후 잠깐 — 화면을 인식할 시간
  return w;
}

/* ---------------------------------------------------------------- 헬퍼 */

const d2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

function arenaNorm(x, y, b, r = 0) {
  const rx = Math.max(1, b.arenaRx - r);
  const ry = Math.max(1, b.arenaRy - r);
  return Math.hypot((x - b.arenaX) / rx, (y - b.arenaY) / ry);
}

function clampToArena(x, y, r, b) {
  const n = arenaNorm(x, y, b, r);
  if (n <= 1 || n === 0) return { x, y };
  return { x: b.arenaX + (x - b.arenaX) / n, y: b.arenaY + (y - b.arenaY) / n };
}

/** 총구 위치 — 탄은 몸 중앙이 아니라 여기서 나간다. */
function muzzlePoint(p, shot, maxDist = Infinity) {
  // 총구가 몸에서 40px 앞이면 몸에 딱 붙은 적은 총구보다 뒤에 있어서 탄이 그냥 지나친다.
  // 실측으로 확인한 버그였다 — 붙은 적이 완전히 무적이 됐다.
  // 그래서 가장 가까운 적보다 앞에서는 탄을 만들지 않는다.
  const m = Math.max(4, Math.min(shot.muzzle ?? 30, maxDist));
  return {
    x: p.x + Math.cos(p.aimA) * m,
    y: p.y + Math.sin(p.aimA) * m - 12,   // 어깨 높이 (그림의 총 피벗과 맞춤)
  };
}

/** 보행 위상은 이동 거리에 비례한다. 시간에 비례시키면 발이 미끄러진다. */
function advanceWalk(e, dx, dy, stride) {
  const moved = Math.hypot(dx, dy);
  if (moved > 0.01) {
    e.walk = (e.walk + (moved / stride) * Math.PI) % (Math.PI * 2);
    e.moving = true;
  } else {
    e.moving = false;
  }
}

function pickKind(wave, rnd, b) {
  const avail = availableKinds(wave, b);
  const w = avail.map((k) => b.kinds[k].weight);
  const total = w.reduce((s, v) => s + v, 0);
  let r = rnd() * total;
  for (let i = 0; i < avail.length; i += 1) { r -= w[i]; if (r <= 0) return avail[i]; }
  return avail[avail.length - 1];
}

function spawnPos(rnd, b, inset = 0.86) {
  const a = rnd() * Math.PI * 2;
  const rr = inset + rnd() * 0.10;
  return { x: b.arenaX + Math.cos(a) * b.arenaRx * rr, y: b.arenaY + Math.sin(a) * b.arenaRy * rr };
}

function makeEnemy(world, rnd) {
  const b = world.b;
  const kind = pickKind(world.wave, rnd, b);
  const k = b.kinds[kind];
  const pos = spawnPos(rnd, b);
  const hp = enemyHp(world.wave, b) * k.hpMul;
  return {
    id: world.nextId++, kind, isBoss: false,
    x: pos.x, y: pos.y, vx: 0, vy: 0,
    r: k.r, hp, maxHp: hp,
    state: ST.DROP, stateT: 0,
    aimX: 0, aimY: 0, walk: 0, moving: false, facing: 1,
    hitFlash: 0, hasHit: false,
    seed: (world.nextId * 2654435761) >>> 0,
  };
}

/**
 * 보스는 스테이지마다 다른 놈이 온다.
 * 정의를 개체에 붙여 둔다 — 렌더·AI 가 전역 표를 다시 뒤지지 않게.
 */
function makeBoss(world, rnd) {
  const b = world.b;
  const def = bossForStage(stageOf(world.wave, b), b);
  const pos = spawnPos(rnd, b, 0.55);
  const hp = bossHp(world.wave, b);
  return {
    id: world.nextId++, kind: 'boss', isBoss: true,
    bossId: def.id, name: def.name, title: def.title,
    patterns: def.patterns, cycle: def.cycle,
    speed: def.speed, approachSec: def.approachSec,
    money: def.money, bio: def.bio,
    x: pos.x, y: pos.y, vx: 0, vy: 0,
    r: def.r, hp, maxHp: hp,
    state: ST.DROP, stateT: 0,
    pattern: null, patternIdx: 0,
    spin: 0, spinShots: 0,          // 회전 난사용
    aimX: 1, aimY: 0, walk: 0, moving: false, facing: 1,
    hitFlash: 0, hasHit: false,
    seed: (world.nextId * 2654435761) >>> 0,
  };
}

/* ------------------------------------------------------------- 시뮬레이션 */

function stepWorld(world, dt, input, rnd) {
  if (world.over || world.shop) { stepFx(world, dt); return world; }
  // 연출 중에는 시뮬레이션을 멈춘다. 이펙트만 흐른다.
  if (world.cine) {
    world.cine.t += dt;
    stepFx(world, dt);
    if (world.cine.t >= world.cine.life) {
      world.cine = null;
      if (world.pendingShop) { world.shop = world.pendingShop; world.pendingShop = null; }
    }
    return world;
  }
  const b = world.b;
  const p = world.player;
  const shot = world.shot;

  world.t += dt;
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 26);

  /* --- 1. 이동 --- */
  const mlen = Math.hypot(input.mx, input.my);
  const wantsMove = mlen > 0.03;
  let pdx = 0, pdy = 0;
  if (wantsMove) {
    const nx = input.mx / mlen, ny = input.my / mlen;
    const sp = world.stats.speed * Math.min(1, mlen);
    const np = clampToArena(p.x + nx * sp * dt, p.y + ny * sp * dt, b.playerR, b);
    pdx = np.x - p.x; pdy = np.y - p.y;
    p.x = np.x; p.y = np.y;
    p.lean += (Math.max(-1, Math.min(1, nx)) - p.lean) * Math.min(1, dt * 9);
  } else {
    p.lean += (0 - p.lean) * Math.min(1, dt * 9);
  }
  advanceWalk(p, pdx, pdy, b.strideLen);

  // 반동 감쇠
  if (p.recoil > 0) p.recoil = Math.max(0, p.recoil - dt * 90);
  if (p.firing > 0) p.firing -= dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  // 충격파는 충전식이다. 최대 보유 수에 도달할 때까지 계속 찬다.
  if (p.skillReady < world.stats.skillCharges) {
    p.skillCd -= dt;
    if (p.skillCd <= 0) {
      p.skillReady += 1;
      p.skillCd = p.skillReady < world.stats.skillCharges ? world.stats.skillCooldown : 0;
    }
  }

  /* --- 2. 사격: 장전은 계속 돌고, 발사는 멈춰야 한다 --- */
  const target = nearestEnemy(world, p.x, p.y, shot.range);

  // 이동 중에는 조준하지 않는다. 총을 이동 방향으로 들고 달린다.
  // 그래야 "달리면서는 못 쏜다" 가 화면만 보고도 납득된다.
  if (wantsMove) {
    p.aimA = Math.atan2(input.my, input.mx);
  } else if (target) {
    p.aimA = Math.atan2(target.y - p.y, target.x - p.x);
  }
  if (Math.abs(Math.cos(p.aimA)) > 0.12) p.facing = Math.cos(p.aimA) > 0 ? 1 : -1;

  // 재장전도, 다음 발 준비도 이동 중에 진행된다.
  // 그래서 "움직이며 채우고 → 멈추는 순간 탕" 의 리듬이 나온다.
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) { p.reloading = 0; p.mag = shot.mag; p.bloom = 0; }
  } else if (p.fireCd > 0) {
    p.fireCd -= dt;
  }

  // 점사는 이미 방아쇠를 당긴 것이므로 움직여도 남은 발이 나간다
  if (p.burstLeft > 0) {
    p.burstT -= dt;
    if (p.burstT <= 0) {
      p.burstLeft -= 1;
      p.burstT = shot.burstGap;
      fireOnce(world, rnd);
    }
  }

  // 발사는 멈춰 있을 때만. 준비가 끝나 있으면 떼는 즉시 나간다.
  if (!wantsMove && p.reloading <= 0 && p.burstLeft <= 0 && p.fireCd <= 0 && target) {
    p.fireCd = shot.interval;
    fireOnce(world, rnd);
    if (shot.burst > 1) { p.burstLeft = shot.burst - 1; p.burstT = shot.burstGap; }
  }

  // 총구 들림은 쏘지 않는 동안 회복된다
  if (p.burstLeft <= 0 && (wantsMove || p.fireCd > shot.interval * 0.55)) {
    p.bloom = Math.max(0, p.bloom - dt * 0.55);
  }

  /* --- 3. 충격파 --- */
  if (input.skill && p.skillReady > 0 && !world.shock) {
    p.skillReady -= 1;
    if (p.skillCd <= 0) p.skillCd = world.stats.skillCooldown;
    world.shock = { t: 0, r: 0, hit: new Set(), x: p.x, y: p.y, R: world.stats.skillRadius };
    world.fx.push({ type: 'shockRing', x: p.x, y: p.y, t: 0, life: b.skillExpandSec + 0.2, R: world.stats.skillRadius });
    world.shake = Math.max(world.shake, 7);
  }
  if (world.shock) {
    const s = world.shock;
    s.t += dt;
    const prog = Math.min(1, s.t / b.skillExpandSec);
    s.r = s.R * (1 - (1 - prog) ** 3);
    for (const e of world.enemies) {
      if (e.state === ST.FALL || e.state === ST.DROP || s.hit.has(e.id)) continue;
      const d = Math.hypot(e.x - s.x, e.y - s.y);
      if (d > s.r) continue;
      s.hit.add(e.id);
      damageEnemy(world, e, shot.damage * world.stats.skillDamageMul);
      if (!e.isBoss) {
        setState(e, ST.CHASE);
        const a = d < 0.001 ? rnd() * Math.PI * 2 : Math.atan2(e.y - s.y, e.x - s.x);
        e.vx += Math.cos(a) * world.stats.skillKnockback;
        e.vy += Math.sin(a) * world.stats.skillKnockback;
      }
    }
    if (prog >= 1) world.shock = null;
  }

  /* --- 4. 아군 탄 --- */
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const bu = world.bullets[i];
    const step = Math.hypot(bu.vx, bu.vy) * dt;
    bu.x += bu.vx * dt; bu.y += bu.vy * dt; bu.life -= dt;
    bu.travel += step;
    let dead = bu.life <= 0 || arenaNorm(bu.x, bu.y, b, -70) > 1;
    if (!dead) {
      for (const e of world.enemies) {
        if (e.state === ST.FALL || e.state === ST.DROP || bu.hit.has(e.id)) continue;
        const rr = e.r + b.bulletR;
        if (d2(bu.x, bu.y, e.x, e.y) <= rr * rr) {
          bu.hit.add(e.id);
          const mul = falloffMul(bu, bu.travel);
          damageEnemy(world, e, bu.dmg * mul);
          const kn = 0.045 * (world.shot.knock ?? 1);
          if (!e.isBoss) { e.vx += bu.vx * kn; e.vy += bu.vy * kn; }
          world.fx.push({ type: 'hit', x: bu.x, y: bu.y, t: 0, life: 0.2 });
          // 유탄 신관은 일정 거리를 날아가야 무장된다. 코앞에서는 안 터진다.
          if (bu.blast > 0 && bu.travel >= (bu.arm ?? 0)) {
            explode(world, bu.x, bu.y, bu.blast, bu.dmg * 0.8, e.id);
          }
          if (bu.hit.size >= bu.pierce) { dead = true; break; }
        }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }

  /* --- 5. 적 --- */
  for (const e of world.enemies) {
    if (e.hitFlash > 0) e.hitFlash -= dt;
    e.stateT += dt;
    if (e.isBoss) stepBoss(world, e, dt, rnd);
    else stepEnemy(world, e, dt);
  }
  separateEnemies(world);
  separateEnemies(world);

  /* --- 6. 적 탄 --- */
  for (let i = world.hostileShots.length - 1; i >= 0; i -= 1) {
    const s = world.hostileShots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    const rr = s.r + b.playerR;
    if (p.invuln <= 0 && d2(s.x, s.y, p.x, p.y) <= rr * rr) {
      hurtPlayer(world, s.dmg, s.src ?? '날아온 탄');
      world.hostileShots.splice(i, 1);
      continue;
    }
    if (s.life <= 0 || arenaNorm(s.x, s.y, b, -40) > 1) world.hostileShots.splice(i, 1);
  }

  /* --- 7. 사망·추락 정리 --- */
  for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
    const e = world.enemies[i];
    if (e.state === ST.FALL) {
      if (e.stateT >= b.fallSec) world.enemies.splice(i, 1);
      continue;
    }
    if (e.hp <= 0) {
      world.enemies.splice(i, 1);
      awardKill(world, e, 'shot', rnd);
    }
  }

  /* --- 8. 조각·보급품 --- */
  stepPickups(world, dt);

  /* --- 9. 웨이브 진행 --- */
  stepWave(world, dt, rnd);

  stepFx(world, dt);
  return world;
}

/* --------------------------------------------------------------- 사격 */

function fireOnce(world, rnd) {
  const p = world.player;
  const shot = world.shot;
  if (p.mag <= 0) { startReload(world); return; }

  const near = nearestEnemy(world, p.x, p.y, shot.range);
  const limit = near ? Math.hypot(near.x - p.x, near.y - p.y) - near.r - 2 : Infinity;
  const m = muzzlePoint(p, shot, limit);
  const base = p.aimA;
  const spread = shot.spread + p.bloom;

  for (let i = 0; i < shot.count; i += 1) {
    const f = shot.count === 1 ? 0 : (i / (shot.count - 1)) * 2 - 1;
    const a = base + f * spread * 0.5 + (rnd() - 0.5) * spread * 0.35;
    world.bullets.push({
      x: m.x, y: m.y,
      vx: Math.cos(a) * shot.speed, vy: Math.sin(a) * shot.speed,
      dmg: shot.damage, pierce: shot.pierce + (world.stats.bonusPierce ?? 0),
      blast: shot.blast, arm: shot.arm,
      falloff: shot.falloff, travel: 0,
      hit: new Set(), life: shot.life,
    });
  }

  p.mag -= 1;
  p.bloom = Math.min(shot.bloomMax, p.bloom + shot.bloom);
  p.recoil = shot.kick;
  p.recoilA = base;
  p.firing = 0.12;
  world.shake = Math.max(world.shake, shot.shake);
  world.fx.push({ type: 'muzzle', x: m.x, y: m.y, a: base, t: 0, life: 0.11, s: shot.flash });
  world.fx.push({ type: 'shell', x: m.x, y: m.y, a: base, t: 0, life: 0.5, seed: (world.nextId * 7919 + p.mag) >>> 0 });

  if (p.mag <= 0) startReload(world);
}

function startReload(world) {
  const p = world.player;
  if (p.reloading > 0) return;
  p.reloading = world.shot.reload;
  p.burstLeft = 0;
  world.fx.push({ type: 'reload', x: p.x, y: p.y, t: 0, life: world.shot.reload });
}

function explode(world, x, y, radius, dmg, skipId) {
  world.fx.push({ type: 'blast', x, y, t: 0, life: 0.3, r: radius });
  world.shake = Math.max(world.shake, 4);
  for (const e of world.enemies) {
    if (e.id === skipId || e.state === ST.FALL || e.state === ST.DROP) continue;
    if (Math.hypot(e.x - x, e.y - y) <= radius + e.r) damageEnemy(world, e, dmg);
  }
}

function damageEnemy(world, e, dmg) {
  e.hp -= dmg;
  e.hitFlash = 0.12;
}

/* ------------------------------------------------------------- 잡몹 행동 */

function setState(e, s) { e.state = s; e.stateT = 0; e.hasHit = false; }

function stepEnemy(world, e, dt) {
  const b = world.b;
  const k = b.kinds[e.kind];
  const p = world.player;
  if (e.state === ST.FALL) return;
  if (e.state === ST.DROP) { if (e.stateT >= b.spawnDropSec) setState(e, ST.CHASE); return; }

  const drag = Math.exp(-b.knockbackDrag * dt);
  e.vx *= drag; e.vy *= drag;
  const kb = Math.hypot(e.vx, e.vy);

  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  if (Math.abs(ux) > 0.2) e.facing = ux > 0 ? 1 : -1;

  let mx = 0, my = 0;

  if (e.state === ST.CHASE) {
    const reach = k.attack === 'shoot' ? k.range : k.r + b.playerR + k.range;
    if (d <= reach && kb < 90) { setState(e, ST.WINDUP); e.aimX = ux; e.aimY = uy; }
    else {
      const away = k.keepDist && d < k.keepDist ? -1 : 1;
      const chase = kb > 70 ? 0.2 : 1;
      mx = ux * k.speed * chase * away;
      my = uy * k.speed * chase * away;
    }
  } else if (e.state === ST.WINDUP) {
    // 예비동작 중에는 제자리에 선다. 이 순간 움직인 플레이어는 확실히 피한다.
    // 이게 "공격 모션을 보고 피한다" 를 성립시키는 유일한 조건이다.
    if (e.stateT >= k.windup) {
      setState(e, ST.STRIKE);
      if (k.attack === 'shoot') {
        const a = Math.atan2(e.aimY, e.aimX);
        world.hostileShots.push({
          x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
          vx: Math.cos(a) * k.shotSpeed, vy: Math.sin(a) * k.shotSpeed,
          dmg: enemyDamage(world.wave, k.damage, b), r: 8, life: 2.4,
          src: `${KIND_NAME.machinz} 의 미사일`,
        });
        world.fx.push({ type: 'muzzle', x: e.x, y: e.y, a, t: 0, life: 0.1, s: 0.8 });
      }
    }
  } else if (e.state === ST.STRIKE) {
    if (k.lunge > 0) {
      mx = e.aimX * k.lunge / Math.max(0.01, k.strike);
      my = e.aimY * k.lunge / Math.max(0.01, k.strike);
    }
    if (!e.hasHit && k.attack !== 'shoot') {
      const rr = e.r + b.playerR + 6;
      if (d2(e.x, e.y, p.x, p.y) <= rr * rr) {
        e.hasHit = true;
        hurtPlayer(world, enemyDamage(world.wave, k.damage, b), KIND_NAME[e.kind] ?? '적');
      }
    }
    if (e.stateT >= k.strike) setState(e, ST.RECOVER);
  } else if (e.state === ST.RECOVER) {
    if (e.stateT >= k.recover) setState(e, ST.CHASE);
  }

  const ndx = (mx + e.vx) * dt, ndy = (my + e.vy) * dt;
  e.x += ndx; e.y += ndy;
  advanceWalk(e, ndx, ndy, Math.max(12, e.r * 1.7));

  if (arenaNorm(e.x, e.y, b, -e.r * 0.35) > 1) { setState(e, ST.FALL); awardKill(world, e, 'fall'); }
}

/* -------------------------------------------------------------- 보스 행동 */

/**
 * 보스 — 패턴을 읽고 피한 뒤 경직에 딜을 넣는 구조.
 * 모든 패턴은 경직이 예비동작보다 길다. 그 차이가 곧 공략 창이다.
 *
 * 패턴 표는 개체(e.patterns)에 붙어 있다. 스테이지마다 다른 보스가 오기 때문이다.
 */
function stepBoss(world, e, dt, rnd) {
  const b = world.b;
  const p = world.player;
  if (e.state === ST.FALL) return;
  if (e.state === ST.DROP) {
    if (e.stateT >= b.spawnDropSec * 1.6) { setState(e, ST.CHASE); e.pattern = null; }
    return;
  }

  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  if (Math.abs(ux) > 0.2) e.facing = ux > 0 ? 1 : -1;

  let mx = 0, my = 0;

  if (e.state === ST.CHASE) {
    mx = ux * e.speed; my = uy * e.speed;
    if (e.stateT >= e.approachSec) {
      e.pattern = e.cycle[e.patternIdx % e.cycle.length];
      e.patternIdx += 1;
      e.aimX = ux; e.aimY = uy;
      setState(e, ST.WINDUP);
    }
  } else if (e.state === ST.WINDUP) {
    // 예비동작 중 정지 — 어떤 패턴인지 보고 대응할 시간을 준다
    const pat = e.patterns[e.pattern];
    if (pat.kind === 'charge' || pat.kind === 'volley' || pat.kind === 'beam') {
      // 조준을 아주 느리게 따라간다. 마지막 순간에 움직이면 빠져나갈 수 있다.
      const trail = pat.kind === 'beam' ? 0.8 : 1.1;
      e.aimX += (ux - e.aimX) * Math.min(1, dt * trail);
      e.aimY += (uy - e.aimY) * Math.min(1, dt * trail);
    }
    if (e.stateT >= pat.windup) {
      setState(e, ST.STRIKE);
      if (pat.kind === 'volley') fireVolley(world, e, pat);
      else if (pat.kind === 'summon') summonMinions(world, e, pat, rnd);
      else if (pat.kind === 'spiral') { e.spin = Math.atan2(e.aimY, e.aimX); e.spinShots = 0; }
    }
  } else if (e.state === ST.STRIKE) {
    const pat = e.patterns[e.pattern];
    if (pat.kind === 'charge') {
      mx = e.aimX * pat.speed; my = e.aimY * pat.speed;
      if (!e.hasHit) {
        const rr = e.r + b.playerR;
        if (d2(e.x, e.y, p.x, p.y) <= rr * rr) {
          e.hasHit = true;
          hurtPlayer(world, enemyDamage(world.wave, pat.damage, b), `${e.name} 의 돌진`);
        }
      }
    } else if (pat.kind === 'slam' && !e.hasHit && e.stateT >= pat.active * 0.5) {
      e.hasHit = true;
      world.fx.push({ type: 'slam', x: e.x, y: e.y, t: 0, life: 0.45, r: pat.radius });
      world.shake = Math.max(world.shake, 12);
      if (d <= pat.radius + b.playerR) hurtPlayer(world, enemyDamage(world.wave, pat.damage, b), `${e.name} 의 내려찍기`);
    } else if (pat.kind === 'beam' && !e.hasHit) {
      e.hasHit = true;
      fireBeam(world, e, pat);
    } else if (pat.kind === 'spiral') {
      // 회전하며 일정 간격으로 뿌린다. 탄 사이 간격이 안전 통로다.
      const gap = pat.active / pat.shots;
      while (e.spinShots < pat.shots && e.stateT >= gap * (e.spinShots + 1)) {
        const a = e.spin + pat.turn * ((e.spinShots + 1) / pat.shots);
        pushHostileShot(world, e, a, pat.shotSpeed, pat.damage, 9, 2.8);
        e.spinShots += 1;
      }
    }
    if (e.stateT >= pat.active) setState(e, ST.RECOVER);
  } else if (e.state === ST.RECOVER) {
    const pat = e.patterns[e.pattern];
    if (e.stateT >= pat.recover) setState(e, ST.CHASE);
  }

  const ndx = mx * dt, ndy = my * dt;
  const np = clampToArena(e.x + ndx, e.y + ndy, e.r * 0.6, b);
  // 돌진 중 벽에 부딪히면 즉시 경직으로 — 다크소울식 "빗나간 큰 기술" 의 대가
  if (e.state === ST.STRIKE && e.patterns[e.pattern]?.kind === 'charge'
      && Math.hypot(np.x - (e.x + ndx), np.y - (e.y + ndy)) > 0.5) {
    setState(e, ST.RECOVER);
    world.shake = Math.max(world.shake, 10);
    world.fx.push({ type: 'blast', x: np.x, y: np.y, t: 0, life: 0.35, r: 70 });
  }
  e.x = np.x; e.y = np.y;
  advanceWalk(e, e.x - (np.x - ndx), e.y - (np.y - ndy), e.r * 1.5);
}

function pushHostileShot(world, e, a, speed, dmg, r, life) {
  world.hostileShots.push({
    x: e.x + Math.cos(a) * e.r * 0.8, y: e.y + Math.sin(a) * e.r * 0.8,
    vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
    dmg: enemyDamage(world.wave, dmg, world.b), r, life,
    src: `${e.name} 의 탄막`,
  });
}

function fireVolley(world, e, pat) {
  const a0 = Math.atan2(e.aimY, e.aimX);
  for (let i = 0; i < pat.shots; i += 1) {
    const f = pat.shots === 1 ? 0 : (i / (pat.shots - 1)) * 2 - 1;
    pushHostileShot(world, e, a0 + f * pat.spread * 0.5, pat.shotSpeed, pat.damage, 10, 2.6);
  }
  world.shake = Math.max(world.shake, 5);
}

/**
 * 관통 광선 — 보스는 움직이지 않는다. 예고선 밖으로 걸어 나가면 안 맞는다.
 * 탄이 아니라 즉발 판정이므로, 판정을 선분과 원의 거리로 한 번만 본다.
 */
function fireBeam(world, e, pat) {
  const a = Math.atan2(e.aimY, e.aimX);
  const p = world.player;
  const ex = Math.cos(a), ey = Math.sin(a);
  const rx = p.x - e.x, ry = p.y - e.y;
  const proj = rx * ex + ry * ey;                     // 선 위로의 사영
  const perp = Math.abs(rx * ey - ry * ex);           // 선까지의 수직 거리
  world.fx.push({ type: 'beam', x: e.x, y: e.y, a, t: 0, life: 0.42, w: pat.width, len: pat.length });
  world.shake = Math.max(world.shake, 11);
  if (proj > 0 && proj < pat.length && perp <= pat.width * 0.5 + world.b.playerR) {
    hurtPlayer(world, enemyDamage(world.wave, pat.damage, world.b), `${e.name} 의 관통 광선`);
  }
}

/**
 * 부하 소환 — 자동 조준이 약점이 되는 순간이다.
 * 부하가 살아 있으면 내 탄이 그쪽으로 간다. 보스를 때리려면 먼저 정리해야 한다.
 * 소환된 적은 웨이브 집계에 넣지 않는다 (보스 웨이브의 진행 바는 보스 체력이다).
 */
function summonMinions(world, e, pat, rnd) {
  const b = world.b;
  for (let i = 0; i < pat.count; i += 1) {
    if (world.enemies.length >= b.maxAliveEnemies) break;
    const m = makeEnemy(world, rnd);
    const a = (i / pat.count) * Math.PI * 2 + rnd() * 0.9;
    const dist = e.r + 70 + rnd() * 40;
    const np = clampToArena(e.x + Math.cos(a) * dist, e.y + Math.sin(a) * dist, m.r + 8, b);
    m.x = np.x; m.y = np.y;
    m.summoned = true;
    world.enemies.push(m);
  }
  world.shake = Math.max(world.shake, 6);
}

/** 보스가 지금 맞아도 되는 상태인가 — UI 가 "지금이야" 를 표시하는 근거 */
function bossVulnerable(e) {
  return e?.isBoss && e.state === ST.RECOVER;
}

/* -------------------------------------------------------------- 공통 */

/**
 * 피격. src 는 "무엇에 맞았나" 다.
 * 사망 연출이 이걸 읽어 화면에 띄운다 — 예고 없는 죽음을 만들지 않기 위한 기록이다.
 */
function hurtPlayer(world, dmg, src = '적') {
  const p = world.player;
  if (p.invuln > 0) return;
  world.lastHurt = src;
  const actual = dmg * (1 - (world.stats.damageReduction ?? 0));
  p.hp -= actual;
  world.damageTaken += actual;
  p.invuln = world.b.invulnSec;
  p.hurtFlash = 0.3;
  world.shake = Math.max(world.shake, 8);
  world.fx.push({ type: 'playerHit', x: p.x, y: p.y, t: 0, life: 0.32 });
  if (p.hp <= 0) { p.hp = 0; world.over = true; world.killedBy = src; }
}

function awardKill(world, e, how, rnd) {
  const b = world.b;
  world.kills += 1;
  const src = e.isBoss ? { money: e.money, bio: e.bio } : b.kinds[e.kind];
  const gm = Math.max(1, Math.round(src.money * world.stats.moneyMul));
  const gb = Math.max(1, Math.round(src.bio * world.stats.bioMul));

  // 돈은 즉시 들어온다. 이번 판에서만 쓰는 것이라 줍게 만들 이유가 없다.
  world.money += gm;

  // 유전자 조각은 **죽은 자리에 떨어진다.** 그 자리는 대개 위험한 자리다.
  // 이게 "먹으러 가다가 죽는" 선택지를 만든다 — 죽음의 이유가 게임이 아니라 플레이어가 된다.
  if (b.bioPickup) dropShards(world, e.x, e.y, gb, rnd);
  else world.bio += gb;

  // 흡혈('재생 조직') — 싸울수록 회복한다. 도망 대신 맞서는 선택지.
  if (world.stats.lifesteal > 0 && how === 'shot') {
    const p = world.player;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + world.stats.lifesteal);
    if (p.hp > before) world.fx.push({ type: 'heal', x: p.x, y: p.y - 26, t: 0, life: 0.6, v: p.hp - before });
  }

  world.fx.push({ type: 'drop', x: e.x, y: e.y - e.r, t: 0, life: 0.95, m: gm, bio: b.bioPickup ? 0 : gb });
  if (how === 'shot') world.fx.push({ type: 'pop', x: e.x, y: e.y, t: 0, life: 0.3 });

  if (e.isBoss) {
    world.bossActive = false;
    world.shake = Math.max(world.shake, 16);
    advanceWave(world, rnd ?? (() => 0.5));
    return;
  }
  if (!world.bossActive && !e.summoned) world.waveKilled += 1;
}

/* ------------------------------------------------------- 조각 · 보급품 */

/**
 * 유전자 조각을 죽은 자리에 흩뿌린다.
 * 한 조각이 담는 양에 상한이 있어, 많이 주는 적일수록 여러 개로 흩어진다 —
 * 보스를 잡으면 조각밭이 생기고, 그걸 다 줍는 것 자체가 하나의 도전이 된다.
 */
function dropShards(world, x, y, amount, rnd = () => 0.5) {
  const b = world.b;
  let left = Math.max(1, Math.round(amount));
  let guard = 0;
  while (left > 0 && guard < 24) {
    const v = Math.min(b.shardMax, left);
    left -= v;
    guard += 1;
    const a = rnd() * Math.PI * 2;
    const d = b.shardScatter * (0.25 + rnd() * 0.75);
    const np = clampToArena(x + Math.cos(a) * d, y + Math.sin(a) * d, b.shardR + 6, b);
    world.pickups.push({
      id: world.nextId++, kind: 'shard', v,
      x: np.x, y: np.y, t: 0, life: world.stats.shardLife ?? b.shardLife,
      seed: (world.nextId * 2654435761) >>> 0,
    });
  }
}

/**
 * 웨이브마다 낮은 확률로 보급품 하나를 **먼 자리에** 떨군다.
 *
 * 피하면서 쏘기만 하면 플레이어는 안전한 구석에 머문다. 그러면 지도가 없는 것과 같다.
 * 보급품은 "저기로 가고 싶다" 를 만들기 위한 장치이므로, 반드시 멀리 놓고 수명을 건다.
 * 가까이 놓으면 선물이고, 안 사라지면 결단이 아니다.
 */
/**
 * 이번 스테이지의 보급 웨이브를 뽑는다. 스테이지마다 딱 한 번 부른다.
 * 첫 웨이브와 보스 웨이브는 제외한다 —
 * 첫 웨이브는 규칙을 배우는 자리이고, 보스 웨이브는 이미 충분히 바쁘다.
 */
function pickSupplyWave(world, rnd) {
  const b = world.b;
  const stage = stageOf(world.wave, b);
  if (world.supplyStage === stage) return;
  world.supplyStage = stage;
  const first = Math.max(2, b.supplyFirstWaveInStage);
  const last = b.wavesPerStage - 1;              // 보스 웨이브 바로 앞까지
  if (last < first) { world.supplyWave = 0; return; }
  const pick = first + Math.floor(rnd() * (last - first + 1));
  world.supplyWave = (stage - 1) * b.wavesPerStage + Math.min(last, pick);
}

function maybeDropSupply(world, rnd) {
  const b = world.b;
  // 스테이지당 한 번, 미리 뽑아 둔 그 웨이브에서만.
  if (world.wave !== world.supplyWave) return;
  if (rnd() > b.supplyChance) return;
  const p = world.player;

  let best = null, bestD = -1;
  for (let i = 0; i < 12; i += 1) {
    const a = rnd() * Math.PI * 2;
    const rr = 0.30 + rnd() * 0.52;
    const x = b.arenaX + Math.cos(a) * b.arenaRx * rr;
    const y = b.arenaY + Math.sin(a) * b.arenaRy * rr;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > bestD) { bestD = d; best = { x, y }; }
    if (d >= b.supplyMinDist) break;
  }
  if (!best) return;

  // 종류는 지금 부족한 것에 기울인다. 체력이 넉넉한데 하트가 나오면 갈 이유가 없다.
  const hurt = 1 - p.hp / p.maxHp;
  const roll = rnd();
  let kind;
  if (roll < 0.30 + hurt * 0.40) kind = 'heart';
  else if (roll < 0.72) kind = 'pouch';
  else kind = 'cluster';

  const wave = world.wave;
  const v = kind === 'heart' ? Math.ceil(p.maxHp * b.supplyHeartFrac)
    : kind === 'pouch' ? Math.round((b.supplyPouchBase + wave * b.supplyPouchPerWave) * world.stats.moneyMul)
      : Math.round((b.supplyClusterBase + wave * b.supplyClusterPerWave) * world.stats.bioMul);

  world.pickups.push({
    id: world.nextId++, kind, v,
    x: best.x, y: best.y, t: 0, life: b.supplyLife,
    seed: (world.nextId * 2654435761) >>> 0,
  });
  world.fx.push({ type: 'supplyCall', x: best.x, y: best.y, t: 0, life: 1.5, k: kind });
}

/**
 * 조각·보급품 진행.
 * 흡인 범위 안이면 끌려오고, 닿으면 먹히고, 수명이 다하면 사라진다.
 * **사라진다는 것이 이 시스템의 전부다** — 안 사라지면 나중에 안전할 때 주우면 그만이다.
 */
function stepPickups(world, dt) {
  const b = world.b;
  const p = world.player;
  const mag = world.stats.magnetRadius;
  const takeR = (world.stats.pickupRadius ?? b.pickupR) + b.playerR;

  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const it = world.pickups[i];
    it.t += dt;

    const dx = p.x - it.x, dy = p.y - it.y;
    const d = Math.hypot(dx, dy) || 1;

    if (d <= mag) {
      // 가까울수록 세게 끌린다. 멀리서는 굼뜨게 따라온다.
      const pull = b.magnetPull * (0.35 + 0.65 * (1 - d / mag));
      it.x += (dx / d) * pull * dt;
      it.y += (dy / d) * pull * dt;
    }

    if (d <= takeR) {
      collectPickup(world, it);
      world.pickups.splice(i, 1);
      continue;
    }
    if (it.t >= it.life) {
      if (it.kind === 'shard' || it.kind === 'cluster') world.bioLost += it.v;
      world.fx.push({ type: 'expire', x: it.x, y: it.y, t: 0, life: 0.35, k: it.kind });
      world.pickups.splice(i, 1);
    }
  }
}

function collectPickup(world, it) {
  const p = world.player;
  if (it.kind === 'shard' || it.kind === 'cluster') {
    world.bio += it.v;
  } else if (it.kind === 'pouch') {
    world.money += it.v;
    world.supplyTaken += 1;
  } else if (it.kind === 'heart') {
    p.hp = Math.min(p.maxHp, p.hp + it.v);
    world.supplyTaken += 1;
  }
  world.fx.push({ type: 'take', x: it.x, y: it.y, t: 0, life: 0.7, k: it.kind, v: it.v });
}

/** 상점을 닫고 다음 스테이지의 첫 웨이브로. main 이 부른다. */
function beginNextWave(world) {
  world.shop = null;
  world.wave += 1;
  world.intermission = world.b.intermissionSec;
  world.fx.push({ type: 'waveBanner', x: 0, y: 0, t: 0, life: world.b.intermissionSec, n: world.wave });
}

/** 상점 효과 적용 — 순수하지 않은 진입점. */
function applyShopOption(world, opt) {
  const p = world.player;
  world.acquired.push({ type: opt.type, name: opt.name, desc: opt.desc });
  if (opt.type === 'weapon') equipWeapon(world, opt.id);
  else if (opt.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * opt.amount));
  else if (opt.type === 'maxhp') {
    const add = Math.round(p.maxHp * opt.amount);
    p.maxHp += add;
    p.hp = Math.min(p.maxHp, p.hp + add);
  } else if (opt.type === 'power') {
    world.stats = { ...world.stats, damage: world.stats.damage * (1 + opt.amount) };
    world.shot = weaponStats(world.weapon, world.stats);
  }
}

/** 무기 교체 — 상점에서 산 직후 호출된다. */
function equipWeapon(world, id) {
  world.weapon = id;
  world.shot = weaponStats(id, world.stats);
  const p = world.player;
  p.mag = world.shot.mag;      // 새 총은 장전된 채로 받는다
  p.reloading = 0;
  p.bloom = 0;
  p.burstLeft = 0;
}

/**
 * 웨이브 진행 — 이 게임 흐름의 심장.
 *
 * 시간이 흘러서 적이 나오는 게 아니다. 웨이브에 편성된 수를 다 소환하고
 * 그 적을 전부 처치해야 다음 웨이브가 온다. 그래서 플레이어가 흐름을 통제한다.
 * 스테이지의 마지막 웨이브는 보스이고, 보스를 잡아야 상점이 열린다.
 */
function stepWave(world, dt, rnd) {
  const b = world.b;

  if (world.intermission > 0) {
    world.intermission -= dt;
    if (world.intermission <= 0) startWave(world, rnd);
    return;
  }
  if (world.shop) return;

  const alive = world.enemies.filter((e) => e.state !== ST.FALL).length;

  // 투입 중인 그룹을 짧은 간격으로 내보낸다 (한 마리씩 툭툭 떨어지는 느낌)
  if (world.groupLeft > 0) {
    world.spawnTimer -= dt;
    if (world.spawnTimer <= 0 && world.enemies.length < b.maxAliveEnemies) {
      world.spawnTimer = b.groupSpawnGap;
      world.enemies.push(makeEnemy(world, rnd));
      world.groupLeft -= 1;
      world.waveLeft -= 1;
      if (world.groupLeft === 0) world.groupAge = 0;
    }
    return;
  }

  world.groupAge += dt;

  // 다음 그룹은 앞 그룹이 거의 정리되어야 나온다.
  // 자동 조준이라 동시에 몰리면 플레이어가 개입할 여지가 없어지기 때문이다.
  if (world.groups.length > 0) {
    const ready = alive <= b.groupClearAt || world.groupAge >= b.groupTimeout;
    if (!ready) return;
    world.groupTimer -= dt;
    if (world.groupTimer > 0) return;
    world.groupLeft = world.groups.shift();
    world.groupTimer = b.groupGap;
    world.spawnTimer = 0;
    return;
  }

  // 클리어 판정: 더 나올 그룹도 없고 살아 있는 적도 없다
  if (alive > 0) return;

  if (world.bossActive) return;                 // 보스 처치는 awardKill 이 처리한다
  advanceWave(world, rnd);
}

/** 다음 웨이브로. 보스 웨이브였다면 상점을 연다. */
function advanceWave(world, rnd) {
  const b = world.b;
  if (isBossWave(world.wave, b)) {
    // 보스가 남긴 부하는 절벽 아래로 쓸어낸다. 클리어 연출은 깨끗해야 한다.
    for (const e of world.enemies) if (e.state !== ST.FALL) { e.state = ST.FALL; e.stateT = 0; }
    world.hostileShots.length = 0;
    world.pendingShop = {
      stage: stageOf(world.wave, b),
      options: rollShopOptions(world.stageIndex, world, rnd),
    };
    // 수송선이 내려오고 스테이지 돌파가 찍히는 시간. 보상 전에 한 박자 쉰다.
    world.cine = { type: 'stageClear', t: 0, life: b.stageClearSec, stage: stageOf(world.wave, b) };
    world.stageIndex += 1;
    return;
  }
  world.wave += 1;
  world.intermission = b.intermissionSec;
  world.fx.push({ type: 'waveBanner', x: 0, y: 0, t: 0, life: b.intermissionSec, n: world.wave });
}

/** 웨이브 시작 — 편성을 채우고 도입부 몇 마리를 즉시 내보낸다. */
function startWave(world, rnd) {
  const b = world.b;
  world.intermission = 0;
  world.waveTotal = waveCount(world.wave, b);
  world.waveLeft = world.waveTotal;
  world.waveKilled = 0;
  world.groups = waveGroups(world.wave, b);
  world.groupLeft = 0;
  world.groupTimer = 0;
  world.groupAge = b.groupTimeout;   // 웨이브 첫 그룹은 기다리지 않는다
  world.spawnTimer = 0;

  pickSupplyWave(world, rnd);
  maybeDropSupply(world, rnd);

  if (isBossWave(world.wave, b)) {
    world.bossActive = true;
    world.groups = [];
    for (const e of world.enemies) if (e.state !== ST.FALL) { e.state = ST.FALL; e.stateT = 0; }
    world.hostileShots.length = 0;
    world.enemies.push(makeBoss(world, rnd));
  }
}

function stepFx(world, dt) {
  for (let i = world.fx.length - 1; i >= 0; i -= 1) {
    world.fx[i].t += dt;
    if (world.fx[i].t >= world.fx[i].life) world.fx.splice(i, 1);
  }
}

/**
 * 겨눌 적. **사거리 밖은 겨누지 않는다.**
 * 겨누면 탄이 허공에서 사라져 "왜 안 맞지" 가 되는데,
 * 그건 플레이어가 뭘 잘못한 게 아니라 그냥 답답한 것이다.
 * @param maxDist 사거리. 없으면 제한 없음
 */
function nearestEnemy(world, x, y, maxDist = Infinity) {
  const lim = maxDist * maxDist;
  let best = null, bestD = Infinity;
  for (const e of world.enemies) {
    if (e.state === ST.FALL || e.state === ST.DROP) continue;
    const d = d2(x, y, e.x, e.y);
    // 몸통 반지름만큼은 봐준다 — 큰 적은 가장자리가 사거리에 닿으면 맞는다
    if (d > lim + e.r * e.r + 2 * e.r * maxDist) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function separateEnemies(world) {
  const list = world.enemies;
  const k = world.b.enemySeparation;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (a.state === ST.FALL || a.state === ST.DROP) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      const c = list[j];
      if (c.state === ST.FALL || c.state === ST.DROP) continue;
      const dx = c.x - a.x, dy = c.y - a.y;
      const rr = a.r + c.r;
      const dd = dx * dx + dy * dy;
      if (dd >= rr * rr || dd === 0) continue;
      const d = Math.sqrt(dd);
      // 보스는 밀리지 않는다. 잡몹만 비켜난다.
      const push = (rr - d) * k;
      if (a.isBoss) { c.x += (dx / d) * push; c.y += (dy / d) * push; }
      else if (c.isBoss) { a.x -= (dx / d) * push; a.y -= (dy / d) * push; }
      else {
        a.x -= (dx / d) * push * 0.5; a.y -= (dy / d) * push * 0.5;
        c.x += (dx / d) * push * 0.5; c.y += (dy / d) * push * 0.5;
      }
    }
  }
}

function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/* ─────────── src/game/art/characters.js ─────────── */
/**
 * GunDude 캐릭터 렌더러.
 *
 * 시안을 확대해 분해한 결과 이 화풍은 부품의 조합이다.
 *   자루 몸통 · 다리 두 개 · 점/X 눈 · 검은 아치 입 · 무기 실루엣
 * 전부 도형이라 이미지 파일이 필요 없다.
 *
 * 다리는 몸통과 분리해 따로 그린다. 붙여 그리면 걸을 수 없기 때문이다.
 * 보행 위상(pose.walk)은 시뮬레이션이 "이동한 거리" 로 돌린 값이다 —
 * 시간으로 돌리면 속도가 변할 때 발이 지면을 미끄러진다.
 */

function jit(seed, salt, amp) {
  return (hash01(seed, salt) * 2 - 1) * amp;
}

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/** 자루 몸통 — 다리 없음. 위가 살짝 넓고 아래가 좁다. */
function sackBody(cx, cy, w, h, seed, wob = 1.4) {
  const T = cy - h / 2, Bt = cy + h / 2;
  const L = cx - w / 2, R = cx + w / 2;
  const BL = cx - w * 0.455, BR = cx + w * 0.455;
  const p = [];
  const push = (x, y, salt, times = 1) => {
    const px = x + jit(seed, salt, wob);
    const py = y + jit(seed, salt + 100, wob);
    for (let i = 0; i < times; i += 1) p.push([px, py]);
  };
  push(L, T, 1, 3);
  push(cx, T - h * 0.02, 2);
  push(R, T, 3, 3);
  push(R - w * 0.012, cy - h * 0.1, 4);
  push(BR, Bt, 5, 3);
  push(cx, Bt + h * 0.012, 6);
  push(BL, Bt, 7, 3);
  push(L + w * 0.012, cy - h * 0.1, 8);
  return p;
}

function drawBody(ctx, cx, cy, w, h, color, seed, lineWidth) {
  const pts = sackBody(cx, cy, w, h, seed);
  const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, lighten(color, 0.13));
  inkShape(ctx, pts, g, lineWidth);
}

/**
 * 다리 두 개. phase 가 π 돌면 한 걸음이다.
 * 앞다리는 들리면서 앞으로, 뒷다리는 지면에 붙어 뒤로 — 그래야 걷는 것으로 보인다.
 */
function drawLegs(ctx, cx, groundY, w, legH, phase, moving, color, seed, lw) {
  const legW = w * 0.26;
  const gap = w * 0.20;
  const swing = moving ? 1 : 0;

  for (const side of [-1, 1]) {
    const ph = phase + (side > 0 ? Math.PI : 0);
    const lift = Math.max(0, Math.sin(ph)) * legH * 0.55 * swing;   // 들림
    const fwd = Math.cos(ph) * w * 0.16 * swing;                     // 앞뒤 흔들림
    const x = cx + side * gap + fwd;
    const top = groundY - legH - lift + jit(seed, 30 + side, 0.5);
    const bot = groundY - lift;
    inkShape(ctx, [
      [x - legW / 2, top], [x + legW / 2, top],
      [x + legW / 2, bot], [x - legW / 2, bot],
    ], color, lw);
  }
}

function eyesDot(ctx, cx, cy, spread, r) {
  ctx.fillStyle = PALETTE.ink;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * spread, cy, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function eyesCross(ctx, cx, cy, spread, size, lw) {
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ex = cx + s * spread;
    ctx.beginPath();
    ctx.moveTo(ex - size, cy - size); ctx.lineTo(ex + size, cy + size);
    ctx.moveTo(ex + size, cy - size); ctx.lineTo(ex - size, cy + size);
    ctx.stroke();
  }
}

/**
 * 찡그린 입 — 이 화풍의 서명이다.
 * 위로 솟은 두꺼운 아치 + 양끝이 아래·바깥으로 뾰족하게 뻗음.
 * 시안 7배 확대 실측: 입 폭 대비 전체 높이 0.45, 중앙 두께 0.24.
 */
function mouthFrown(ctx, cx, cy, w, seed, teeth = 3, bodyColor = null) {
  const hw = w / 2;
  const tipY = cy + w * 0.20;

  if (bodyColor) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(cx, cy + w * 0.40, hw * 0.72, w * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tipL = tipY + jit(seed, 70, w * 0.025);
  const tipR = tipY + jit(seed, 71, w * 0.025);
  ctx.beginPath();
  ctx.moveTo(cx - hw, tipL);
  ctx.bezierCurveTo(
    cx - hw * 0.46, cy - w * (0.377 + jit(seed, 72, 0.03)),
    cx + hw * 0.46, cy - w * (0.377 + jit(seed, 73, 0.03)),
    cx + hw, tipR);
  ctx.bezierCurveTo(
    cx + hw * 0.52, cy - w * 0.057,
    cx - hw * 0.52, cy - w * 0.057,
    cx - hw, tipL);
  ctx.closePath();
  ctx.fillStyle = PALETTE.ink;
  ctx.fill();

  if (teeth > 0) {
    const tw = w * 0.062;
    for (let i = 0; i < teeth; i += 1) {
      const f = teeth === 1 ? 0 : (i / (teeth - 1)) * 2 - 1;
      const tx = cx + f * w * 0.115;
      const th = w * (0.105 - Math.abs(f) * 0.025);
      const ty = cy - w * 0.135 + Math.abs(f) * w * 0.035 + jit(seed, 40 + i, w * 0.006);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(tx - tw / 2, ty - th / 2, tw, th, tw * 0.35);
      ctx.fill();
    }
  }
}

function bodyBand(ctx, cx, cy, w, seed, lw) {
  inkStroke(ctx, [
    [cx - w * 0.52, cy + jit(seed, 60, 1)],
    [cx, cy + jit(seed, 61, 1.4)],
    [cx + w * 0.52, cy + jit(seed, 62, 1)],
  ], lw);
}

/**
 * 무기 실루엣 — 계열마다 다른 모양.
 *
 * 【화기 전문가 재검수】 이전에는 모양이 rifle·pistol 둘뿐이었고
 * 플레이어는 무기와 무관하게 항상 소총이 그려졌다. 권총을 들어도 소총이 보였다.
 * 계열마다 눈에 띄는 특징을 하나씩 잡아 실루엣만으로 구분되게 다시 그린다:
 *   권총=짧은 슬라이드 · 기관단총=수직 탄창 · 산탄총=총열 밑 튜브탄창
 *   카빈=탄창+개머리판 · 지정사수=조준경 · 경기관총=드럼+양각대
 *   대물소총=긴 총열+총구제동기 · 유탄=굵은 대구경 총열
 *
 * 모든 실루엣은 오른쪽을 향하고, (0,0) 이 어깨 피벗이다.
 */
function drawGun(ctx, x, y, len, dir, seed, lw, kind = 'rifle') {
  const s = dir >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, 1);
  const S = PALETTE.slate;
  const D = '#6E74A4';                       // 어두운 슬레이트 — 부속 구분용
  const q = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // 총은 각진 도형이다. inkShape(곡선 보간) 를 쓰면 전부 풍선이 된다.
  const box = (x0, y0, x1, y1, c = S) => inkPoly(ctx, q(x0, y0, x1, y1), c, lw);
  const poly = (pts, c = S) => inkPoly(ctx, pts, c, lw);
  const L = len;

  if (kind === 'pistol') {
    const h = L * 0.115;
    box(-L * 0.18, -h, L * 0.30, h);                       // 슬라이드
    box(L * 0.26, -h * 0.55, L * 0.40, h * 0.55);          // 짧은 총열
    poly([[-L * 0.15, h * 0.7], [L * 0.02, h * 0.7],
          [-L * 0.04, h * 3.1], [-L * 0.24, h * 3.1]]);    // 손잡이
  } else if (kind === 'smg') {
    const h = L * 0.125;
    box(-L * 0.30, -h, L * 0.26, h);                        // 몸통
    box(L * 0.22, -h * 0.45, L * 0.44, h * 0.45);           // 짧은 총열
    box(-L * 0.40, -h * 0.75, -L * 0.28, h * 0.55, D);      // 접이식 개머리판
    poly([[-L * 0.08, h * 0.8], [L * 0.06, h * 0.8],
          [L * 0.03, h * 3.4], [-L * 0.11, h * 3.4]], D);   // 길게 튀어나온 탄창
    poly([[L * 0.14, h * 0.8], [L * 0.24, h * 0.8],
          [L * 0.22, h * 2.0], [L * 0.12, h * 2.0]]);       // 수직 앞손잡이
  } else if (kind === 'shotgun') {
    const h = L * 0.115;
    box(-L * 0.44, -h, L * 0.30, h);                        // 굵은 몸통
    box(L * 0.26, -h * 0.62, L * 0.68, h * 0.10);           // 총열
    box(L * 0.16, h * 0.18, L * 0.60, h * 0.86, D);         // 총열 밑 튜브 탄창
    poly([[-L * 0.52, -h * 0.35], [-L * 0.42, -h],
          [-L * 0.42, h], [-L * 0.52, h * 0.45]]);          // 개머리판
    poly([[-L * 0.10, h * 0.9], [L * 0.04, h * 0.9],
          [L * 0.00, h * 2.9], [-L * 0.16, h * 2.9]]);      // 손잡이
  } else if (kind === 'dmr') {
    const h = L * 0.10;
    box(-L * 0.46, -h, L * 0.30, h);
    box(L * 0.26, -h * 0.42, L * 0.74, h * 0.42);           // 긴 총열
    box(-L * 0.16, -h * 2.6, L * 0.14, -h * 1.1, D);        // 조준경
    box(-L * 0.10, -h * 1.1, L * 0.02, -h * 0.9, D);
    poly([[-L * 0.54, -h * 0.25], [-L * 0.44, -h],
          [-L * 0.44, h], [-L * 0.54, h * 0.5]]);
    poly([[-L * 0.12, h * 0.8], [L * 0.02, h * 0.8],
          [-L * 0.02, h * 3.0], [-L * 0.18, h * 3.0]]);
    poly([[L * 0.06, h * 0.8], [L * 0.20, h * 0.8],
          [L * 0.16, h * 2.4], [L * 0.02, h * 2.4]], D);    // 탄창
  } else if (kind === 'lmg') {
    const h = L * 0.145;
    box(-L * 0.44, -h, L * 0.30, h);                        // 굵은 몸통
    box(L * 0.26, -h * 0.38, L * 0.70, h * 0.38);
    box(-L * 0.30, -h * 1.7, L * 0.02, -h * 0.9, D);        // 캐링 핸들
    inkShape(ctx, wobbleCircle(-L * 0.06, h * 1.5, h * 1.25, seed, h * 0.06, 14), D, lw); // 드럼 탄창
    poly([[L * 0.30, h * 0.4], [L * 0.36, h * 0.4],
          [L * 0.50, h * 2.6], [L * 0.42, h * 2.6]], D);    // 양각대
    poly([[L * 0.30, h * 0.4], [L * 0.36, h * 0.4],
          [L * 0.20, h * 2.6], [L * 0.12, h * 2.6]], D);
    poly([[-L * 0.16, h * 0.9], [-L * 0.02, h * 0.9],
          [-L * 0.06, h * 3.0], [-L * 0.22, h * 3.0]]);
  } else if (kind === 'amr') {
    const h = L * 0.125;
    box(-L * 0.50, -h, L * 0.22, h);
    box(L * 0.18, -h * 0.34, L * 0.86, h * 0.34);           // 아주 긴 총열
    box(L * 0.80, -h * 0.80, L * 0.92, h * 0.80, D);        // 총구제동기
    box(L * 0.84, -h * 1.30, L * 0.88, h * 1.30, D);
    box(-L * 0.24, -h * 2.7, L * 0.10, -h * 1.1, D);        // 큰 조준경
    poly([[-L * 0.62, -h * 0.2], [-L * 0.48, -h],
          [-L * 0.48, h * 1.1], [-L * 0.62, h * 0.7]]);     // 굵은 개머리판
    poly([[-L * 0.18, h * 0.85], [-L * 0.04, h * 0.85],
          [-L * 0.08, h * 3.0], [-L * 0.24, h * 3.0]]);
  } else if (kind === 'gl') {
    const h = L * 0.135;
    box(-L * 0.34, -h * 0.8, L * 0.10, h * 0.8);            // 짧은 몸통
    box(L * 0.06, -h * 1.35, L * 0.52, h * 1.35);           // 굵은 대구경 총열
    box(L * 0.46, -h * 1.55, L * 0.56, h * 1.55, D);        // 총구
    box(-L * 0.30, -h * 2.0, -L * 0.06, -h * 0.9, D);       // 곡사 조준기
    poly([[-L * 0.16, h * 0.9], [-L * 0.02, h * 0.9],
          [-L * 0.06, h * 3.0], [-L * 0.22, h * 3.0]]);
  } else if (kind === 'a2') {
    // M16A2 계열 — 3점사. 카빈과 실루엣이 같으면 "숫자만 다른 총" 이 된다.
    // 구분점은 **위로 솟은 캐링 핸들**과 **고정형 긴 개머리판**이다.
    const h = L * 0.105;
    box(-L * 0.52, -h, L * 0.28, h);
    box(L * 0.24, -h * 0.40, L * 0.72, h * 0.40);            // 긴 총열
    box(L * 0.66, -h * 0.62, L * 0.76, h * 0.62, D);         // 소염기
    box(-L * 0.22, -h * 2.3, L * 0.14, -h * 1.2, D);         // 캐링 핸들
    box(-L * 0.20, -h * 1.2, -L * 0.16, -h * 0.9, D);
    box(L * 0.10, -h * 1.2, L * 0.14, -h * 0.9, D);
    poly([[-L * 0.66, -h * 0.55], [-L * 0.50, -h],
          [-L * 0.50, h], [-L * 0.66, h * 0.75]]);           // 고정 개머리판
    poly([[-L * 0.16, h * 0.85], [-L * 0.02, h * 0.85],
          [-L * 0.06, h * 3.0], [-L * 0.22, h * 3.0]]);
    poly([[L * 0.02, h * 0.85], [L * 0.18, h * 0.85],
          [L * 0.14, h * 2.8], [-L * 0.02, h * 2.8]], D);    // 탄창
  } else {
    // rifle — 카빈 계열 (기본)
    const h = L * 0.115;
    box(-L * 0.46, -h, L * 0.30, h);
    box(L * 0.26, -h * 0.42, L * 0.62, h * 0.42);
    box(L * 0.58, -h * 0.60, L * 0.68, h * 0.60, D);        // 소염기
    poly([[-L * 0.54, -L * 0.03], [-L * 0.44, -h],
          [-L * 0.44, h], [-L * 0.54, h * 0.5]]);           // 개머리판
    poly([[-L * 0.14, h * 0.85], [L * 0.00, h * 0.85],
          [-L * 0.04, h * 3.0], [-L * 0.20, h * 3.0]]);     // 손잡이
    poly([[L * 0.04, h * 0.85], [L * 0.20, h * 0.85],
          [L * 0.16, h * 2.8], [L * 0.00, h * 2.8]], D);    // 탄창
  }
  ctx.restore();
}

/**
 * 보스 표식.
 *
 * 이전에는 붉은 사선 하나를 그어 뒀는데, 그게 뭘 뜻하는지 화면에서 읽히지 않았다.
 * 표식은 장식이 아니라 **그 보스가 무엇인지** 를 말해야 한다. 셋을 이렇게 나눈다:
 *   sergent — 계급장 셰브런 3줄. 저놈이 우두머리라는 뜻이다.
 *   doc     — 의무 십자. 붉은 십자는 제네바 협약 보호 표장이라 쓰지 않고 초록으로 그린다.
 *   siren   — 삼각 경고 표식 + 안테나. 포격을 부르는 관제라는 뜻이다.
 */
function bossMark(ctx, id, cx, cy, w, h, lw) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (id === 'doc') {
    const s = w * 0.17;
    ctx.fillStyle = '#3E9E5B';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    ctx.roundRect(cx - s * 0.30, cy - s, s * 0.60, s * 2, s * 0.16);
    ctx.roundRect(cx - s, cy - s * 0.30, s * 2, s * 0.60, s * 0.16);
    ctx.fill(); ctx.stroke();
  } else if (id === 'siren') {
    // 가슴의 삼각 경고
    const s = w * 0.20;
    ctx.fillStyle = PALETTE.xpAmber;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s * 0.92, cy + s * 0.66);
    ctx.lineTo(cx - s * 0.92, cy + s * 0.66);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(cx - s * 0.10, cy - s * 0.42, s * 0.20, s * 0.62);
    ctx.beginPath(); ctx.arc(cx, cy + s * 0.40, s * 0.13, 0, Math.PI * 2); ctx.fill();
  } else {
    // 계급장 셰브런 — 세 줄이 겹쳐 올라간다
    ctx.strokeStyle = PALETTE.goldDark;
    ctx.lineWidth = lw * 1.5;
    for (let i = 0; i < 3; i += 1) {
      const y = cy - h * 0.02 + i * h * 0.055;
      const half = w * 0.20;
      ctx.beginPath();
      ctx.moveTo(cx - half, y + half * 0.55);
      ctx.lineTo(cx, y - half * 0.30);
      ctx.lineTo(cx + half, y + half * 0.55);
      ctx.stroke();
    }
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = lw * 0.5;
    for (let i = 0; i < 3; i += 1) {
      const y = cy - h * 0.02 + i * h * 0.055;
      const half = w * 0.20;
      ctx.beginPath();
      ctx.moveTo(cx - half, y + half * 0.55);
      ctx.lineTo(cx, y - half * 0.30);
      ctx.lineTo(cx + half, y + half * 0.55);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 관제 보스의 안테나 — 실루엣만으로 다른 놈임을 알린다. */
function antenna(ctx, cx, topY, w, lw) {
  ctx.save();
  ctx.strokeStyle = PALETTE.slate;
  ctx.lineWidth = lw * 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.24, topY);
  ctx.lineTo(cx + w * 0.34, topY - w * 0.42);
  ctx.stroke();
  ctx.fillStyle = PALETTE.hpRed;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = lw * 0.7;
  ctx.beginPath();
  ctx.arc(cx + w * 0.34, topY - w * 0.46, w * 0.055, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

const PRESET = {
  boyz:    { color: PALETTE.boyz,    eyes: 'dot',   band: false, teeth: 3, gun: null },
  demonz:  { color: PALETTE.demonz,  eyes: 'cross', band: false, teeth: 3, gun: null },
  machinz: { color: PALETTE.machinz, eyes: 'dot',   band: true,  teeth: 0, gun: 'rifle' },   // 잡몹은 소총 고정
  dude:    { color: PALETTE.dude,    eyes: 'dot',   band: false, teeth: 3, gun: 'rifle' },   // spec.gunShape 로 덮어쓴다
  // 보스 3종 — 색·눈·무기·표식이 전부 다르다. 실루엣만 보고 누군지 알아야 한다.
  boss_sergent: { color: PALETTE.dude,    eyes: 'cross', band: false, teeth: 4, gun: 'lmg',   mark: 'sergent' },
  boss_doc:     { color: '#DDEFE2',       eyes: 'dot',   band: false, teeth: 2, gun: 'pistol', mark: 'doc' },
  boss_siren:   { color: PALETTE.machinz, eyes: 'cross', band: true,  teeth: 0, gun: 'amr',    mark: 'siren' },
};
PRESET.boss = PRESET.boss_sergent;

/**
 * 공격 상태에 따른 자세 변형.
 * 예비동작에서 뒤로 젖히고, 타격에서 앞으로 튀어나온다.
 * 이 과장이 없으면 텔레그래프가 눈에 안 보여서 피할 수가 없다.
 */
function attackPose(pose) {
  const out = { push: 0, rot: 0, sx: 1, sy: 1 };
  if (!pose) return out;
  const k = Math.max(0, Math.min(1, pose.prog ?? 0));
  if (pose.state === ST.WINDUP) {
    out.push = -10 * k;
    out.rot = -0.16 * k;
    out.sx = 1 + 0.10 * k; out.sy = 1 - 0.10 * k;   // 웅크림
  } else if (pose.state === ST.STRIKE) {
    out.push = 16 * (1 - k * 0.5);
    out.rot = 0.30 * (1 - k * 0.6);
    out.sx = 1 - 0.08; out.sy = 1 + 0.12;           // 뻗음
  } else if (pose.state === ST.RECOVER) {
    const e = 1 - k;
    out.push = 4 * e;
    out.rot = 0.10 * e;
    out.sy = 1 - 0.07 * e;
  }
  return out;
}

/**
 * 캐릭터 한 마리.
 * @param {object} spec
 *   kind, x, y(발밑), size, seed, facing
 *   pose: { walk, moving, lean, state, prog }   — 없으면 정지 자세
 */
function drawCharacter(ctx, spec) {
  const {
    kind = 'boyz', x, y, size = 40, seed = 1, facing = 1,
    pose = null, shadow = false,
  } = spec;

  const w = size;
  const h = size * 1.15;
  const legH = size * 0.22;
  const lw = Math.max(1.5, size * 0.052);
  const preset = PRESET[kind] ?? PRESET.boyz;

  const walk = pose?.walk ?? 0;
  const moving = pose?.moving ?? false;
  const lean = pose?.lean ?? 0;
  const ap = attackPose(pose);

  // 몸통 상하 반동 — 다리가 들릴 때 몸이 내려앉는다
  const bob = moving ? Math.abs(Math.sin(walk)) * size * 0.055 : Math.sin(walk * 0.15) * size * 0.012;

  if (shadow) groundShadow(ctx, x, y + size * 0.05, size * 0.5, size * 0.09, 0.85);

  ctx.save();
  ctx.translate(x, y);
  if (ap.push !== 0) ctx.translate(facing * ap.push, 0);

  // 다리는 몸통보다 먼저(뒤에) 그린다
  drawLegs(ctx, 0, 0, w, legH, walk, moving, preset.color, seed, lw);

  ctx.rotate((ap.rot * facing) + lean * 0.10);
  ctx.scale(ap.sx, ap.sy);

  const cy = -legH - h / 2 + bob;
  drawBody(ctx, 0, cy, w, h, preset.color, seed, lw);

  const faceY = cy - h * 0.20;
  if (preset.eyes === 'cross') eyesCross(ctx, 0, faceY, w * 0.235, w * 0.068, lw * 0.95);
  else eyesDot(ctx, 0, faceY, w * 0.235, w * 0.042);

  if (preset.band) bodyBand(ctx, 0, cy + h * 0.06, w, seed, lw * 0.8);
  else if (preset.teeth > 0) mouthFrown(ctx, 0, cy + h * 0.06, w * 0.70, seed, preset.teeth, preset.color);

  if (preset.mark === 'siren') antenna(ctx, 0, cy - h * 0.5, w, lw);

  const gunKind = spec.gunShape ?? preset.gun;
  if (gunKind) {
    // 총은 조준 방향을 향한다. 몸 방향만 따르면 탄이 총구에서 나가는 것처럼 안 보인다.
    // 총은 어깨를 축으로 조준 방향을 향한다.
    // 발밑을 축으로 돌리면 총이 몸 아래로 처진다 (실측으로 확인).
    const pivotY = cy + h * 0.12;
    ctx.save();
    ctx.translate(0, pivotY);
    if (spec.aimA !== undefined && spec.aimA !== null) {
      ctx.rotate(spec.aimA);
      // 왼쪽을 겨누면 회전각이 ±90° 를 넘어 총이 뒤집힌 채로 그려졌다.
      // 총구는 조준 방향을 그대로 향하되, 총 자체는 위아래를 되돌려 항상 제대로 든다.
      // (조준축 기준 거울상 — 실제 사수가 총을 반대편으로 겨눌 때 하는 것과 같다)
      if (Math.cos(spec.aimA) < 0) ctx.scale(1, -1);
      drawGun(ctx, w * 0.30, 0, w * 1.20, 1, seed, lw * 0.75, gunKind);
    } else {
      drawGun(ctx, facing * w * 0.30, 0, w * 1.20, facing, seed, lw * 0.75, gunKind);
    }
    ctx.restore();
  }

  // 보스 표식은 총보다 위에 그린다. 총이 가슴을 가려 표식이 안 보였다.
  if (preset.mark) bossMark(ctx, preset.mark, 0, cy + h * 0.26, w, h, lw);

  ctx.restore();

  if (spec.flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.8, spec.flash * 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x, y - legH - h / 2, w * 0.62, h * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 금 조각 (드랍 연출) */
function drawGold(ctx, x, y, size, seed) {
  const lw = Math.max(1.2, size * 0.16);
  inkShape(ctx, wobbleCircle(x, y, size * 0.5, seed, size * 0.06, 8), PALETTE.gold, lw);
}

/* ─────────── src/game/art/icons.js ─────────── */
/**
 * 유전자 노드 픽토그램.
 *
 * 【화풍 규칙】 이 게임의 그림은 전부 **굵은 먹선 + 삐뚤삐뚤한 손그림**이다.
 * 캐릭터도 총도 그렇게 그렸는데 아이콘만 매끈한 벡터면 혼자 딴 데서 온 것처럼 보인다.
 *
 * 그래서 두 가지를 지킨다:
 *  1. **먹선을 두른다.** 같은 그림을 검정으로 굵게 한 번 깔고, 그 위에 색을 얹는다.
 *  2. **살짝 비뚤다.** 아이콘마다 고정된 각도로 조금 기울이고 크기를 흔든다.
 *     정점마다 떨면 24px 안에서 뭉개지므로, 전체를 기울이는 쪽이 값도 싸고 잘 보인다.
 *
 * 좌표계는 −1..+1 정규 공간이다. 크기와 색은 호출자가 정한다.
 *
 * 이미지 파일을 쓰지 않는 이유는 캐릭터와 같다 — 크기가 계속 바뀌고,
 * 상태마다 색이 달라지고, 번들 용량을 아껴야 한다.
 */

/** 지금 먹선을 까는 중인가. shape 함수가 F·L 을 통해 참조한다. */
let OUTLINE = false;
const OUTLINE_W = 0.34;

/** 채우기. 먹선 패스에서는 굵게 두르기까지 한다. */
function F(ctx) {
  ctx.fill();
  if (OUTLINE) ctx.stroke();
}

/** 선 굵기. 먹선 패스에서는 그만큼 더 굵어진다. */
function L(ctx, w) {
  ctx.lineWidth = OUTLINE ? w + OUTLINE_W : w;
}

function begin(ctx, cx, cy, r, color, seed) {
  ctx.save();
  ctx.translate(cx, cy);
  // 손그림 흔들림 — 아이콘마다 고정된 기울기와 크기 차이
  const tilt = (hash01(seed, 11) - 0.5) * 0.16;
  const sx = 1 + (hash01(seed, 12) - 0.5) * 0.07;
  const sy = 1 + (hash01(seed, 13) - 0.5) * 0.07;
  ctx.rotate(tilt);
  ctx.scale(r * sx, r * sy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  L(ctx, 0.17);
}

/* --------------------------------------------------------- 그림들 */

/** 주사기 — 각성. 스스로 몸에 바늘을 꽂는 일이다. */
function icoSyringe(ctx) {
  ctx.save();
  ctx.rotate(-0.72);
  ctx.beginPath(); ctx.roundRect(-0.30, -0.62, 0.60, 1.02, 0.10); F(ctx);
  ctx.beginPath(); ctx.roundRect(-0.46, -0.80, 0.92, 0.22, 0.09); F(ctx);
  L(ctx, 0.16);
  ctx.beginPath(); ctx.moveTo(0, 0.40); ctx.lineTo(0, 0.92); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-0.13, -0.52, 0.26, 0.36, 0.06); F(ctx);
  ctx.restore();
}

/** 하트 — 체력 */
function icoHeart(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, 0.72);
  ctx.bezierCurveTo(-1.22, -0.16, -0.48, -1.00, 0, -0.26);
  ctx.bezierCurveTo(0.48, -1.00, 1.22, -0.16, 0, 0.72);
  ctx.closePath();
  F(ctx);
}

/** 주먹 — 피해 */
function icoFist(ctx) {
  ctx.beginPath(); ctx.roundRect(-0.58, -0.30, 1.06, 0.82, 0.22); F(ctx);
  ctx.beginPath(); ctx.roundRect(-0.78, -0.06, 0.30, 0.46, 0.13); F(ctx);
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.roundRect(-0.26 + i * 0.30, -0.56, 0.22, 0.32, 0.10);
    F(ctx);
  }
}

/** 방패 — 피해 감소 */
function icoShield(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, -0.78);
  ctx.lineTo(0.70, -0.48);
  ctx.lineTo(0.70, 0.14);
  ctx.quadraticCurveTo(0.70, 0.60, 0, 0.84);
  ctx.quadraticCurveTo(-0.70, 0.60, -0.70, 0.14);
  ctx.lineTo(-0.70, -0.48);
  ctx.closePath();
  F(ctx);
}

/** 군화 — 이동 속도 */
function icoBoot(ctx) {
  ctx.beginPath();
  ctx.moveTo(-0.32, -0.76);
  ctx.lineTo(0.16, -0.76);
  ctx.lineTo(0.16, 0.08);
  ctx.lineTo(0.74, 0.40);
  ctx.lineTo(0.74, 0.78);
  ctx.lineTo(-0.58, 0.78);
  ctx.lineTo(-0.58, 0.28);
  ctx.lineTo(-0.32, 0.08);
  ctx.closePath();
  F(ctx);
}

/** 번개 — 발사 간격 */
function icoBolt(ctx) {
  ctx.beginPath();
  ctx.moveTo(0.22, -0.86);
  ctx.lineTo(-0.54, 0.08);
  ctx.lineTo(-0.04, 0.08);
  ctx.lineTo(-0.22, 0.86);
  ctx.lineTo(0.56, -0.14);
  ctx.lineTo(0.04, -0.14);
  ctx.closePath();
  F(ctx);
}

/** 탄창 — 재장전 */
function icoMag(ctx) {
  ctx.beginPath(); ctx.roundRect(-0.38, -0.70, 0.76, 1.40, 0.15); F(ctx);
  if (!OUTLINE) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.roundRect(-0.22, -0.40 + i * 0.40, 0.44, 0.17, 0.07);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** 조준경 — 사거리 */
function icoScope(ctx) {
  L(ctx, 0.21);
  ctx.beginPath(); ctx.arc(0, 0, 0.54, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -0.92); ctx.lineTo(0, -0.32);
  ctx.moveTo(0, 0.32); ctx.lineTo(0, 0.92);
  ctx.moveTo(-0.92, 0); ctx.lineTo(-0.32, 0);
  ctx.moveTo(0.32, 0); ctx.lineTo(0.92, 0);
  ctx.stroke();
}

/** 밀치는 화살 — 넉백 */
function icoPush(ctx) {
  L(ctx, 0.23);
  ctx.beginPath(); ctx.moveTo(-0.84, -0.42); ctx.lineTo(-0.84, 0.42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.50, 0); ctx.lineTo(0.36, 0); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.84, 0); ctx.lineTo(0.26, -0.44); ctx.lineTo(0.26, 0.44);
  ctx.closePath(); F(ctx);
}

/** 꿰뚫는 탄 — 철갑탄 */
function icoPierce(ctx) {
  L(ctx, 0.15);
  for (const x of [-0.34, 0.06]) {
    ctx.beginPath();
    ctx.moveTo(x, -0.62); ctx.lineTo(x, 0.62);
    ctx.stroke();
  }
  L(ctx, 0.21);
  ctx.beginPath(); ctx.moveTo(-0.90, 0); ctx.lineTo(0.32, 0); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.90, 0); ctx.lineTo(0.28, -0.42); ctx.lineTo(0.28, 0.42);
  ctx.closePath(); F(ctx);
}

/** 시계 — 쿨타임 */
function icoClock(ctx) {
  L(ctx, 0.21);
  ctx.beginPath(); ctx.arc(0, 0.04, 0.70, 0, Math.PI * 2); ctx.stroke();
  L(ctx, 0.18);
  ctx.beginPath();
  ctx.moveTo(0, 0.04); ctx.lineTo(0, -0.40);
  ctx.moveTo(0, 0.04); ctx.lineTo(0.38, 0.22);
  ctx.stroke();
}

/** 동심원 — 폭발 범위 */
function icoRings(ctx) {
  L(ctx, 0.17);
  for (const r of [0.32, 0.62, 0.92]) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, 0.15, 0, Math.PI * 2); F(ctx);
}

/** 폭발 — 폭발 피해 */
function icoBurst(ctx) {
  ctx.beginPath();
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.90 : 0.40;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); F(ctx);
}

/** 파동 — 밀치는 힘 */
function icoWave(ctx) {
  L(ctx, 0.20);
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(-0.48, 0, 0.30 + i * 0.28, -0.95, 0.95);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(-0.60, 0, 0.17, 0, Math.PI * 2); F(ctx);
}

/** 폭탄 두 개 — 이중 기폭 */
function icoTwoBombs(ctx) {
  for (const [x, y, r] of [[-0.32, 0.22, 0.44], [0.36, -0.06, 0.38]]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); F(ctx);
    L(ctx, 0.14);
    ctx.beginPath();
    ctx.moveTo(x + r * 0.5, y - r * 0.8);
    ctx.quadraticCurveTo(x + r * 1.3, y - r * 1.7, x + r * 0.5, y - r * 2.1);
    ctx.stroke();
  }
}

/** 동전 — 돈 */
function icoCoin(ctx) {
  ctx.beginPath(); ctx.arc(0, 0, 0.80, 0, Math.PI * 2); F(ctx);
  if (!OUTLINE) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 0.20;
    ctx.beginPath(); ctx.moveTo(0, -0.44); ctx.lineTo(0, 0.44); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -0.20, 0.23, Math.PI * 0.9, Math.PI * 2.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.20, 0.23, Math.PI * 1.9, Math.PI * 1.2); ctx.stroke();
    ctx.restore();
  }
}

/** 이중나선 — 유전자 조각 */
function icoHelix(ctx) {
  L(ctx, 0.20);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.44, -0.86);
    ctx.bezierCurveTo(s * -0.58, -0.32, s * 0.58, 0.32, s * -0.44, 0.86);
    ctx.stroke();
  }
  L(ctx, 0.14);
  for (const y of [-0.48, 0, 0.48]) {
    const w = y === 0 ? 0.48 : 0.30;
    ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

/** 자루 — 시작 자금 */
function icoPouch(ctx) {
  ctx.beginPath();
  ctx.moveTo(-0.44, -0.32);
  ctx.quadraticCurveTo(-0.92, 0.46, 0, 0.82);
  ctx.quadraticCurveTo(0.92, 0.46, 0.44, -0.32);
  ctx.closePath(); F(ctx);
  L(ctx, 0.19);
  ctx.beginPath(); ctx.moveTo(-0.54, -0.40); ctx.lineTo(0.54, -0.40); ctx.stroke();
}

/** 자석 — 촉수 감각 · 흡인장 */
function icoMagnet(ctx) {
  L(ctx, 0.36);
  ctx.beginPath(); ctx.arc(0, 0.12, 0.58, Math.PI, 0); ctx.stroke();
  L(ctx, OUTLINE ? 0.30 : 0.01);
  ctx.beginPath(); ctx.rect(-0.76, 0.12, 0.32, 0.50); F(ctx);
  ctx.beginPath(); ctx.rect(0.44, 0.12, 0.32, 0.50); F(ctx);
}

/** 십자 뚫린 하트 — 재생 조직 */
function icoRegen(ctx) {
  ctx.save();
  ctx.scale(0.88, 0.88);
  icoHeart(ctx);
  ctx.restore();
  if (!OUTLINE) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.roundRect(-0.13, -0.46, 0.26, 0.74, 0.05);
    ctx.roundRect(-0.37, -0.22, 0.74, 0.26, 0.05);
    ctx.fill();
    ctx.restore();
  }
}

/** 별 — 예비 */
function icoStar(ctx) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 0.90 : 0.38;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); F(ctx);
}

/**
 * 【번들 이름 충돌 방지 — 실제로 났던 사고】
 * 그림 함수 이름을 그대로 두면 번들에서 다른 모듈과 부딪힌다.
 * `boot`(군화) 가 main.js 의 `boot()`(부트 시퀀스) 와 충돌해
 * **번들 전체가 SyntaxError 로 죽었다.** 로컬 dev 는 모듈 스코프라 멀쩡했고
 * 배포본만 로딩 화면에서 멈췄다 — 그래서 늦게 발견됐다.
 * 그래서 함수는 `ico*` 접두사를 쓰고, 바깥에는 이 표만 노출한다.
 */
const SHAPES = {
  syringe: icoSyringe, heart: icoHeart, fist: icoFist, shield: icoShield,
  boot: icoBoot, bolt: icoBolt, mag: icoMag, scope: icoScope, push: icoPush,
  pierce: icoPierce, clock: icoClock, rings: icoRings, burst: icoBurst,
  wave: icoWave, twoBombs: icoTwoBombs, coin: icoCoin, helix: icoHelix,
  pouch: icoPouch, magnet: icoMagnet, regen: icoRegen, star: icoStar,
};

/**
 * 노드 → 픽토그램 이름.
 * 효과가 무엇을 건드리는지에서 뽑는다. 새 노드를 넣어도 알아서 따라온다.
 */
function iconForNode(n) {
  if (!n) return 'star';
  if (n.id === 'root') return 'syringe';
  const e = n.eff ?? {};
  if (e.lifesteal) return 'regen';
  if (e.pierce) return 'pierce';
  if (e.charges) return 'twoBombs';
  if (e.magnet || e.magR) return 'magnet';
  if (e.hp) return 'heart';
  if (e.dr) return 'shield';
  if (e.spd) return 'boot';
  if (e.dmg) return 'fist';
  if (e.itv) return 'bolt';
  if (e.rld) return 'mag';
  if (e.rng) return 'scope';
  if (e.kb) return 'push';
  if (e.skCd) return 'clock';
  if (e.skR) return 'rings';
  if (e.skDmg) return 'burst';
  if (e.skKb) return 'wave';
  if (e.startMoney) return 'pouch';
  if (e.money && e.bio) return 'helix';
  if (e.money) return 'coin';
  if (e.bio) return 'helix';
  return 'star';
}

/** 아이콘마다 고정된 흔들림을 주기 위한 씨앗. 같은 아이콘은 늘 같은 각도다. */
function seedOf(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 픽토그램 하나. r 은 그림이 차지할 반경.
 * 먹선을 먼저 깔고 그 위에 색을 얹는다 — 캐릭터·총과 같은 순서다.
 */
function drawIcon(ctx, name, cx, cy, r, color = '#FFFFFF') {
  const f = SHAPES[name] ?? SHAPES.star;
  const seed = seedOf(name);

  OUTLINE = true;
  begin(ctx, cx, cy, r, PALETTE.ink, seed);
  f(ctx);
  ctx.restore();
  OUTLINE = false;

  begin(ctx, cx, cy, r, color, seed);
  f(ctx);
  ctx.restore();
}

const ICON_NAMES = Object.keys(SHAPES);

export {
  PALETTE,
  drawCharacter,
  drawGun,
  drawGold,
  drawIcon,
  iconForNode,
  ICON_NAMES,
};
