// 게임 루프. 순수 로직(core)과 화면(game)을 이어 붙이는 곳.
//
// 여기에는 규칙을 새로 쓰지 않는다. 규칙은 전부 core 에 있고 테스트가 지킨다.
// 이 파일이 하는 일은 "시간을 흘려보내며 core 를 호출하고 결과를 그리는 것" 뿐이다.

import { BALANCE, expForLevel } from './core/balance.js';
import { makeRng } from './core/rng.js';
import { computeStats, newCombatCtx } from './core/combat.js';
import { newRun, baseStats, currentEnemy, stageEnemyCount, choosePerk, killEnemy, die } from './core/run.js';
import { newBattle, stepBattle, onStageAdvance } from './game/battle.js';
import { loadSpriteMap } from './game/sprites.js';
import { fitCanvas, draw, VIEW, COLORS } from './game/render.js';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
let ctx = fitCanvas(canvas);
window.addEventListener('resize', () => { ctx = fitCanvas(canvas); });

let rng = makeRng(Date.now() & 0xffff);
let run = newRun(1);
let stats = computeStats(baseStats(run), run.perks, newCombatCtx());
let enemy = spawnEnemy();
let battle = freshBattle();
let floats = [];
let frame = 0;
let paused = false;
let speed = 1;
let last = performance.now();

function freshBattle() {
  return { ...newBattle(stats), playerX: 40, enemyX: VIEW.w - 120, walking: true };
}

function spawnEnemy() {
  const e = currentEnemy(run);
  return { ...e, hp: e.maxHp };
}

function addFloat(text, x, y, color, size = 13) {
  floats.push({ text, x, y, color, size, life: 1, vy: -22 });
}

/** 퍽 선택 오버레이. 고를 때까지 게임이 멈춘다. */
function showPerks(perks) {
  paused = true;
  overlay.innerHTML = `
    <div class="sheet">
      <h2>레벨 업</h2>
      <p class="sub">하나를 고르세요</p>
      ${perks.map((p, i) => `
        <button class="perk grade-${p.등급}" data-i="${i}">
          <span class="grade">${p.등급}</span>
          <strong>${p.이름}</strong>
          <span class="desc">${p.설명}</span>
        </button>`).join('')}
    </div>`;
  overlay.classList.add('on');
  overlay.querySelectorAll('.perk').forEach((btn) => {
    btn.onclick = () => {
      const beforeMax = stats.maxHp;
      run = choosePerk(run, perks[+btn.dataset.i]);
      stats = computeStats(baseStats(run), run.perks, battle.ctx);
      // 최대 체력이 늘면 늘어난 만큼 채워 준다 (줄면 그만큼 깎는다)
      battle.hp = Math.max(1, Math.min(stats.maxHp, battle.hp + (stats.maxHp - beforeMax)));
      battle.armor = Math.min(battle.armor, stats.armorMax);
      overlay.classList.remove('on');
      overlay.innerHTML = '';
      paused = false;
    };
  });
}

/** 사망 화면. 챕터 처음부터 다시 시작한다. */
function showDeath(lastRun) {
  paused = true;
  overlay.innerHTML = `
    <div class="sheet">
      <h2 class="dead">쓰러졌다</h2>
      <p class="sub">챕터 ${run.chapter} 처음부터 다시 시작합니다</p>
      <div class="stats">
        <div><span>도달 스테이지</span><b>${lastRun.stage} / 20</b></div>
        <div><span>레벨</span><b>${lastRun.level}</b></div>
        <div><span>처치</span><b>${lastRun.kills}</b></div>
        <div><span>코인</span><b>${lastRun.coins}</b></div>
        <div><span>버틴 시간</span><b>${lastRun.elapsed.toFixed(0)}초</b></div>
      </div>
      ${lastRun.perks.length ? `<p class="perklist">${lastRun.perks.join(' · ')}</p>` : ''}
      <button class="again">다시 시작</button>
    </div>`;
  overlay.classList.add('on');
  overlay.querySelector('.again').onclick = restart;
}

/** 챕터 클리어 화면. */
function showClear() {
  paused = true;
  overlay.innerHTML = `
    <div class="sheet">
      <h2 class="clear">챕터 ${run.chapter} 클리어</h2>
      <p class="sub">처치 ${run.kills} · 레벨 ${run.level} · ${run.elapsed.toFixed(0)}초</p>
      <p class="perklist">${run.perks.map((p) => p.이름).join(' · ') || '고른 퍽 없음'}</p>
      <button class="again">다음 챕터</button>
    </div>`;
  overlay.classList.add('on');
  overlay.querySelector('.again').onclick = () => {
    run = newRun(run.chapter + 1);
    resetAfterRun();
  };
}

function restart() {
  const dead = die(run);
  run = { ...dead, over: false };
  resetAfterRun();
}

function resetAfterRun() {
  stats = computeStats(baseStats(run), run.perks, newCombatCtx());
  enemy = spawnEnemy();
  battle = freshBattle();
  floats = [];
  overlay.classList.remove('on');
  overlay.innerHTML = '';
  paused = false;
}

function tick(dt) {
  run.elapsed += dt;

  // 걸어서 적에게 접근한다
  const reach = battle.enemyX - battle.playerX;
  if (reach > 70) {
    battle.playerX += 60 * dt;
    battle.walking = true;
    return;
  }
  battle.walking = false;

  const res = stepBattle(battle, stats, baseStats(run), run.perks, enemy, rng, dt);
  stats = res.stats;

  // 일어난 일을 화면 글자로 옮긴다
  for (const e of res.events) {
    if (e.type === 'hit') {
      addFloat(`${e.damage}${e.behead || e.instant ? '!' : ''}`, battle.enemyX + 40, 210,
        e.behead || e.instant ? '#ff5aa8' : e.crit ? '#ffd24a' : '#ffffff',
        e.behead || e.instant ? 18 : e.crit ? 17 : 13);
    } else if (e.type === 'thorns') {
      addFloat(`${e.damage}`, battle.enemyX + 60, 195, '#c88aff', 12);
    } else if (e.type === 'counter') {
      addFloat(`반격 ${e.damage}`, battle.enemyX + 40, 195, '#8fd8ff', 13);
    } else if (e.type === 'heal') {
      addFloat(`+${e.amount}`, battle.playerX + 40, 245, '#7ce87c', 12);
    } else if (e.type === 'evade') {
      addFloat('회피', battle.playerX + 40, 220, '#8fd8ff', 12);
    } else if (e.type === 'taken') {
      addFloat(`-${e.damage}`, battle.playerX + 40, 220, '#ff7a7a', 13);
    } else if (e.type === 'revive') {
      addFloat('불굴', VIEW.w / 2, 190, '#ffd24a', 18);
    }
  }

  if (res.killed) { onKill(); return; }
  if (res.died) {
    const dead = die(run);
    run = { ...dead, over: false };
    showDeath(dead.lastRun);
  }
}

function onKill() {
  const beforeLevel = run.level;
  const beforeStage = run.stage;
  run = killEnemy(run, rng);
  stats = computeStats(baseStats(run), run.perks, battle.ctx);

  if (run.cleared) { showClear(); return; }
  if (run.level > beforeLevel) addFloat('LEVEL UP', VIEW.w / 2, 190, '#ffd24a', 15);

  // 스테이지를 넘어갔으면 스테이지 트리거를 발동한다
  if (run.stage > beforeStage) {
    onStageAdvance(battle, stats, run.perks, rng)
      .forEach((e) => addFloat(`+${e.amount}`, battle.playerX + 40, 245, '#7ce87c', 12));
  }

  enemy = spawnEnemy();
  battle.enemyX = VIEW.w - 120;
  battle.playerX = Math.max(30, battle.playerX - 30);
  battle.foeCd = 1.4;

  if (run.pendingPerks) showPerks(run.pendingPerks);
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * speed;
  last = now;
  frame += 1;

  if (!paused) tick(dt);

  floats = floats.filter((f) => {
    f.y += f.vy * dt;
    f.life -= dt * 1.5;
    return f.life > 0;
  });

  draw(ctx, { run, battle, stats, enemy, frame, floats });
  requestAnimationFrame(loop);
}

// 배속 토글
document.getElementById('speed').onclick = (e) => {
  speed = speed === 1 ? 2 : 1;
  e.target.textContent = `x${speed}`;
};

// 디버그 훅 — 브라우저 자동화로 검증할 때 쓴다.
// 탭이 백그라운드면 requestAnimationFrame 이 초당 0.5회로 느려져서
// 눈으로도 자동화로도 "멈춘 것처럼" 보인다. 그때 step() 으로 강제로 굴린다.
window.__game = {
  step(seconds = 1, slice = 1 / 60) {
    for (let t = 0; t < seconds && !paused; t += slice) tick(slice);
    draw(ctx, { run, battle, stats, enemy, frame, floats });
  },
  state: () => ({
    chapter: run.chapter, stage: run.stage, level: run.level,
    kills: run.kills, coins: run.coins, perks: run.perks.map((p) => p.이름),
    hp: Math.round(battle.hp), maxHp: stats.maxHp,
    atk: +stats.atk.toFixed(1), enemyHp: Math.round(enemy.hp), enemyMax: enemy.maxHp,
    paused, elapsed: +run.elapsed.toFixed(1),
  }),
  pickPerk(i = 0) {
    const btn = overlay.querySelectorAll('.perk')[i];
    if (btn) btn.click();
    return !!btn;
  },
};

loadSpriteMap().then(() => requestAnimationFrame(loop));
