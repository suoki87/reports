// 전투 진행자 — 순수 로직(core)을 시간에 따라 굴린다.
//
// main.js 와 시뮬레이터가 같은 코드를 쓴다. 둘이 따로 구현하면
// "화면에서는 되는데 시뮬에서는 안 되는" 상황이 생긴다.
// 실제로 검사기에서 피격 처리를 두 갈래로 나눴다가 반격 퍽 5종을 오진한 적이 있다.

import {
  computeStats, newCombatCtx, resetForNewEnemy, resolveAttack, resolveDamage,
  resolveCounter, heal, repairArmor, effectiveAspd, effectiveLifesteal, applyLifestealGain,
} from '../core/combat.js';
import { BALANCE } from '../core/balance.js';

/** 전투 진행 상태를 만든다. */
export function newBattle(stats) {
  return {
    hp: stats.maxHp,
    armor: stats.armorMax,
    ctx: newCombatCtx(),
    myCd: 0,
    foeCd: 1.4,
  };
}

/**
 * 시간 dt 만큼 전투를 진행한다.
 * 상태를 직접 바꾸고, 일어난 일을 events 로 돌려준다 (화면이 그릴 거리).
 *
 * @returns {{events:Array, killed:boolean, died:boolean, stats:object}}
 */
export function stepBattle(b, stats, base, perks, enemy, rng, dt) {
  const events = [];
  let killed = false, died = false;

  b.myCd -= dt;
  b.foeCd -= dt;

  // ── 내 공격 ──────────────────────────────────────────
  if (b.myCd <= 0 && enemy.hp > 0) {
    b.myCd = 1 / effectiveAspd(stats, b.hp, stats.maxHp);
    const r = resolveAttack(stats, b.ctx, enemy, { hp: b.hp, maxHp: stats.maxHp }, rng);
    b.ctx = r.ctx;
    enemy.hp -= r.total;
    for (const h of r.hits) {
      events.push({ type: 'hit', damage: h.damage, crit: h.crit, behead: h.behead, instant: h.instant });
    }

    // 흡혈
    const ls = effectiveLifesteal(stats, b.hp, stats.maxHp);
    let healedNow = 0;
    if (ls > 0) {
      const before = b.hp;
      b.hp = heal(b.hp, stats.maxHp, r.total * ls);
      healedNow += b.hp - before;
    }
    if (stats.critLifesteal > 0) {
      const critDmg = r.hits.filter((h) => h.crit).reduce((a, h) => a + h.damage, 0);
      const before = b.hp;
      b.hp = heal(b.hp, stats.maxHp, critDmg * stats.critLifesteal);
      healedNow += b.hp - before;
    }
    if (healedNow > 0) {
      events.push({ type: 'heal', amount: Math.round(healedNow) });
      const nc = applyLifestealGain(stats, b.ctx, healedNow);
      if (nc !== b.ctx) { b.ctx = nc; stats = computeStats(base, perks, b.ctx); }
    }

    // 치명타 발동 퍽
    if (r.hits.some((h) => h.crit)) {
      for (const p of perks) {
        const t = p.trigger;
        if (t?.on !== 'crit' || !rng.chance(t.chance)) continue;
        if (t.healPct) {
          const before = b.hp;
          b.hp = heal(b.hp, stats.maxHp, stats.maxHp * t.healPct);
          if (b.hp > before) events.push({ type: 'heal', amount: Math.round(b.hp - before) });
        }
        if (t.armorFlat) b.armor = repairArmor(b.armor, stats.armorMax, t.armorFlat);
        if (t.stackCrit) b.ctx.stackCrit += t.stackCrit;
        if (t.guaranteeNextCrit) b.ctx.guaranteeCrit = true;
      }
      stats = computeStats(base, perks, b.ctx);
    }

    if (enemy.hp <= 0) {
      killed = true;
      // 처치 발동 퍽
      for (const p of perks) {
        const t = p.trigger;
        if (t?.on !== 'kill' || !rng.chance(t.chance)) continue;
        if (t.healPct) {
          const before = b.hp;
          b.hp = heal(b.hp, stats.maxHp, stats.maxHp * t.healPct);
          if (b.hp > before) events.push({ type: 'heal', amount: Math.round(b.hp - before) });
        }
        if (t.stackAtk) b.ctx.stackAtk += t.stackAtk;
        if (t.stackAspd) b.ctx.stackAspd += t.stackAspd;
        if (t.stackCrit) b.ctx.stackCrit += t.stackCrit;
        if (t.slayerStack) b.ctx.slayerStack = Math.min(t.slayerMax ?? 99, b.ctx.slayerStack + t.slayerStack);
        if (t.snowballAtk) b.ctx.snowball += t.snowballAtk;
        if (t.splash) b.ctx.pendingSplash += enemy.maxHp * t.splash;
        if (t.instantKill) b.ctx.instantKillNext = true;
        if (t.instantAttack) b.myCd = 0;
      }
      stats = computeStats(base, perks, b.ctx);
      return { events, killed, died, stats };
    }
  }

  // ── 적 공격 ──────────────────────────────────────────
  if (b.foeCd <= 0 && enemy.hp > 0) {
    b.foeCd = 1.2;
    const d = resolveDamage(stats, b.armor, b.hp, enemy.atk, rng);
    b.armor = d.armor;
    b.hp = d.hp;

    if (d.thorns > 0) {
      enemy.hp -= d.thorns;
      events.push({ type: 'thorns', damage: d.thorns });
      if (enemy.hp <= 0) killed = true;
    }

    if (d.evaded) {
      events.push({ type: 'evade' });
      for (const p of perks) {
        const t = p.trigger;
        if (t?.on !== 'evade' || !rng.chance(t.chance)) continue;
        if (t.healPct) {
          const before = b.hp;
          b.hp = heal(b.hp, stats.maxHp, stats.maxHp * t.healPct);
          if (b.hp > before) events.push({ type: 'heal', amount: Math.round(b.hp - before) });
        }
        if (t.counterAttack) {
          const c = resolveCounter(stats, rng, true);
          enemy.hp -= c;
          events.push({ type: 'counter', damage: c });
          if (enemy.hp <= 0) killed = true;
        }
      }
    } else {
      events.push({ type: 'taken', damage: d.taken });
      // 눈덩이는 맞으면 절반이 무너진다
      if (b.ctx.snowball > 0 && d.taken > 0) {
        b.ctx.snowball *= 0.5;
        stats = computeStats(base, perks, b.ctx);
      }
      if (stats.counter > 0) {
        const c = resolveCounter(stats, rng);
        if (c > 0) {
          enemy.hp -= c;
          events.push({ type: 'counter', damage: c });
          if (enemy.hp <= 0) killed = true;
        }
      }
    }

    if (b.hp <= 0) {
      // 불굴 — 판당 한 번 버틴다
      if (stats.reviveOnce > 0 && !b.ctx.revived) {
        b.ctx.revived = true;
        b.hp = Math.round(stats.maxHp * stats.reviveOnce);
        events.push({ type: 'revive' });
      } else {
        died = true;
      }
    }
  }

  return { events, killed, died, stats };
}

/**
 * 스테이지를 넘어갈 때.
 * 기본 회복(레퍼런스의 야영지 대신)과 스테이지 트리거 퍽을 발동한다.
 */
export function onStageAdvance(b, stats, perks, rng) {
  const events = [];
  b.ctx = resetForNewEnemy(b.ctx);

  // 기본 회복 — 회복이 흡혈 전유물이 되지 않게 하는 장치
  const c = BALANCE.챕터;
  if (c.스테이지_회복률 > 0) {
    const before = b.hp;
    b.hp = heal(b.hp, stats.maxHp, stats.maxHp * c.스테이지_회복률);
    if (b.hp > before) events.push({ type: 'heal', amount: Math.round(b.hp - before) });
  }
  if (c.스테이지_보호막회복률 > 0 && stats.armorMax > 0) {
    b.armor = repairArmor(b.armor, stats.armorMax, stats.armorMax * c.스테이지_보호막회복률);
  }
  for (const p of perks) {
    const t = p.trigger;
    if (t?.on !== 'stage' || !rng.chance(t.chance)) continue;
    if (t.healPct) {
      const before = b.hp;
      b.hp = heal(b.hp, stats.maxHp, stats.maxHp * t.healPct);
      if (b.hp > before) events.push({ type: 'heal', amount: Math.round(b.hp - before) });
    }
  }
  return events;
}
