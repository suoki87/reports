// 화면 그리기. 계산은 하지 않는다 — 받은 상태를 그리기만 한다.
//
// 왜 계산과 분리하나: 그리기에 계산이 섞이면 테스트가 불가능해진다.
// 이 파일에는 게임 규칙이 한 줄도 없어야 한다.

import { drawSprite, usingRealArt } from './sprites.js';

export const VIEW = { w: 360, h: 780 };   // 논리 해상도 (세로 폰 비율)

const COLORS = {
  skyTop: '#8fc98f', skyBot: '#a8d8a0',
  road: '#c9a878', roadEdge: '#b09060',
  hp: '#d84c4c', hpBg: '#3a1c1c',
  exp: '#5ad86a', expBg: '#1c3a1e',
  armor: '#5aa8d8', armorBg: '#1c2c3a',
  panel: '#1a1a22', panelLine: '#3a3a48',
  text: '#f0f0f4', dim: '#9a9aa8',
  grade: { 일반: '#9a9aa8', 희귀: '#5a9ad8', 전설: '#e8b84a' },
};

export function fitCanvas(canvas) {
  // dpr 을 2 로 묶는다. 고해상도 폰에서 3~4배로 그리면 프레임이 떨어진다.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const availW = canvas.parentElement.clientWidth;
  const availH = canvas.parentElement.clientHeight;
  const scale = Math.min(availW / VIEW.w, availH / VIEW.h);
  canvas.style.width = `${VIEW.w * scale}px`;
  canvas.style.height = `${VIEW.h * scale}px`;
  canvas.width = Math.round(VIEW.w * scale * dpr);
  canvas.height = Math.round(VIEW.h * scale * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export function draw(ctx, s) {
  const { run, battle, stats, enemy, frame, floats } = s;
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);

  drawField(ctx, run, frame);
  drawActors(ctx, battle, enemy, frame);
  floats.forEach((f) => drawFloat(ctx, f));
  drawTopBar(ctx, run);
  drawBars(ctx, run, battle, stats);
  drawStatPanel(ctx, stats, run);

  if (!usingRealArt()) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, VIEW.h - 14, VIEW.w, 14);
    ctx.fillStyle = COLORS.dim;
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('도형으로 그리는 중 — assets/sprite-map.json 을 넣으면 픽셀 아트로 바뀝니다', VIEW.w / 2, VIEW.h - 4);
  }
}

function drawField(ctx, run, frame) {
  const fieldTop = 56, fieldH = 300;
  const g = ctx.createLinearGradient(0, fieldTop, 0, fieldTop + fieldH);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(1, COLORS.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, fieldTop, VIEW.w, fieldH);

  const roadY = fieldTop + fieldH * 0.42, roadH = fieldH * 0.36;
  ctx.fillStyle = COLORS.roadEdge;
  ctx.fillRect(0, roadY - 3, VIEW.w, roadH + 6);
  ctx.fillStyle = COLORS.road;
  ctx.fillRect(0, roadY, VIEW.w, roadH);

  // 스크롤하는 바닥 점 — 전진하고 있다는 느낌만 준다
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 14; i++) {
    const x = ((i * 47 - frame * 0.6) % (VIEW.w + 40)) - 20;
    ctx.fillRect(x, roadY + roadH * 0.75, 8, 3);
  }
}

function drawActors(ctx, battle, enemy, frame) {
  const groundY = 56 + 300 * 0.62;
  const size = 86;
  drawSprite(ctx, 'player', battle.playerX, groundY - size, size, size, Math.floor(frame / 6));
  if (enemy.hp > 0) {
    const key = enemy.boss ? 'boss' : 'enemy';
    const es = enemy.boss ? size * 1.25 : size;
    drawSprite(ctx, key, battle.enemyX, groundY - es, es, es, Math.floor(frame / 6), true);
    drawEnemyHpBar(ctx, battle.enemyX, groundY - es - 10, es, enemy);
  }
}

function drawEnemyHpBar(ctx, x, y, w, enemy) {
  const h = 5;
  ctx.fillStyle = COLORS.hpBg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.hp;
  ctx.fillRect(x, y, w * Math.max(0, enemy.hp / enemy.maxHp), h);
  ctx.fillStyle = COLORS.text;
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(enemy.hp), x + w / 2, y - 2);
}

function drawFloat(ctx, f) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, f.life);
  ctx.fillStyle = f.color;
  ctx.font = `bold ${f.size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(f.text, f.x, f.y);
  ctx.restore();
}

function drawTopBar(ctx, run) {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(0, 0, VIEW.w, 56);
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`챕터 ${run.chapter}`, VIEW.w / 2, 22);

  // 스테이지 진행 바
  const bw = VIEW.w * 0.7, bx = (VIEW.w - bw) / 2, by = 32;
  ctx.fillStyle = '#2a2a34';
  ctx.fillRect(bx, by, bw, 5);
  ctx.fillStyle = '#e8b84a';
  ctx.fillRect(bx, by, bw * ((run.stage - 1) / 20), 5);
  ctx.fillStyle = COLORS.dim;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`${run.stage} / 20`, VIEW.w / 2, 50);

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.dim;
  ctx.fillText(`처치 ${run.kills}`, 10, 22);
  ctx.textAlign = 'right';
  ctx.fillText(`코인 ${run.coins}`, VIEW.w - 10, 22);
}

function drawBars(ctx, run, battle, stats) {
  const y = 370, w = VIEW.w - 20;
  bar(ctx, 10, y, w, 12, battle.hp / stats.maxHp, COLORS.hpBg, COLORS.hp,
      `${Math.ceil(battle.hp)} / ${stats.maxHp}`);
  bar(ctx, 10, y + 16, w, 8, run.exp / expNeed(run.level), COLORS.expBg, COLORS.exp,
      `Lv.${run.level}`);
}

function expNeed(level) {
  return 5 * level + 5;   // balance.js 와 같은 식 — 표시용
}

function bar(ctx, x, y, w, h, pct, bg, fg, label) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fg;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
  ctx.fillStyle = COLORS.text;
  ctx.font = `${h - 2}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h - 2);
}

function drawStatPanel(ctx, stats, run) {
  const top = 400;
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(0, top, VIEW.w, VIEW.h - top);

  const rows = [
    ['공격력', stats.atk.toFixed(1)],
    ['공격속도', `${stats.aspd.toFixed(2)}/s`],
    ['치명타율', `${(stats.crit * 100).toFixed(0)}%`],
    ['치명타배율', `${(stats.critDmg * 100).toFixed(0)}%`],
    ['회피율', `${(stats.eva * 100).toFixed(0)}%`],
    ['흡혈', `${(stats.lifesteal * 100).toFixed(0)}%`],
  ];
  ctx.font = '11px system-ui, sans-serif';
  rows.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 12 + col * (VIEW.w / 2 - 6), y = top + 20 + row * 20;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(k, x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(v, x + VIEW.w / 2 - 24, y);
  });

  // 고른 퍽 목록
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.dim;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`고른 퍽 ${run.perks.length}개`, 12, top + 92);
  run.perks.slice(-9).forEach((p, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    ctx.fillStyle = COLORS.grade[p.등급] || COLORS.dim;
    ctx.fillText(p.이름, 12 + col * 112, top + 110 + row * 15);
  });
}

export { COLORS };
