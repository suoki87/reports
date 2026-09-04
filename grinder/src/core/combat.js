// 전투 계산. 전부 순수 함수다 — 같은 입력이면 같은 출력.
//
// 왜 순수하게 두나: 이 파일이 밸런스의 심장이다. 화면·사운드·저장이 섞이면
// 테스트할 수 없고, 테스트할 수 없으면 "왜 여기서 죽지?" 에 답할 수 없다.
//
// 퍽 60종의 효과를 여기서 해석한다. 퍽에 새 필드를 추가하면 반드시 여기도 고친다 —
// 정의만 있고 동작하지 않는 퍽은 데이터가 아니라 거짓말이다.
//
// 불변식 (tests/test_core.mjs · test_perks.mjs 가 지킨다):
//   - 피해는 항상 0 이상
//   - 보호막이 체력보다 먼저 닳는다
//   - 회피하면 피해가 정확히 0
//   - 같은 시드면 전투 결과가 완전히 같다
//   - 체력은 최대치를 넘지 않는다
//   - 정의된 퍽 60종이 모두 실제로 효과를 낸다

import { BALANCE } from './balance.js';

/** 전투 중에만 사는 상태. 적이 바뀌거나 판이 끝나면 일부가 사라진다. */
export function newCombatCtx() {
  return {
    stackAtk: 0,        // 처치 누적 공격력 (판 내내)
    stackCrit: 0,       // 처치·치명타 누적 치명타율 (판 내내)
    stackAspd: 0,       // 처치 누적 공격속도 (판 내내)
    slayerStack: 0,     // 학살자 (판 내내)
    snowball: 0,        // 눈덩이 (피격 시 절반 소실)
    lifestealAtk: 0,    // 피의 순환 (판 내내)
    rampAspd: 0,        // 몰아치기 (적이 바뀌면 초기화)
    flurryHits: 0,      // 연속 명중 수 (빗나가면 초기화)
    guaranteeCrit: false,
    firstHitDone: false, // 이 적에게 첫 공격을 했는가
    revived: false,      // 불굴을 이미 썼는가
    pendingSplash: 0,    // 다음 적에게 넘길 폭발 피해
    instantKillNext: false,
    instantAttack: false,
  };
}

/** 적이 바뀔 때 초기화되는 부분만 리셋한다. */
export function resetForNewEnemy(ctx) {
  return { ...ctx, rampAspd: 0, firstHitDone: false, flurryHits: 0 };
}

/**
 * 퍽 목록에서 최종 스탯을 계산한다.
 * base(레벨·장비로 정해진 값) + 퍽 + 전투 중 누적(ctx).
 */
export function computeStats(base, perks, ctx = newCombatCtx()) {
  const s = {
    atk: base.atk, aspd: base.aspd, maxHp: base.maxHp,
    crit: base.crit, critDmg: base.critDmg, eva: base.eva,
    lifesteal: base.lifesteal,
    counter: 0, counterMul: 1, thorns: 0, thornsBase: false,
    armorMax: 0, dmgReduce: 0, armorDmgReduce: 0,
    multiStrike: 0, multiStrikeChain: false,
    executeThreshold: 0, executeMul: 1, executeKill: 0,
    firstHitMul: 0, highHpDmg: 0, highHpThreshold: 0.5, pressDmg: 0,
    critPierce: false, critOverflow: false,
    critLowHpMul: 1, critLowHpThreshold: 0,
    lowHpAspd: 0, lowHpLifestealMul: 1, lowHpLifestealThreshold: 0,
    rampAspdMax: 0, rampAspdStep: 0,
    flurryCount: 0, flurryMul: 1,
    reviveOnce: 0, critLifesteal: 0,
    lifestealToAtk: 0, lifestealToAtkMax: 0,
  };
  let atkMul = 1, aspdMul = 1, hpMul = 1;

  for (const p of perks) {
    const st = p.stat;
    if (!st) continue;
    if (st.atkMul) atkMul += st.atkMul;
    if (st.aspdMul) aspdMul += st.aspdMul;
    if (st.hpMul) hpMul += st.hpMul;
    if (st.critAdd) s.crit += st.critAdd;
    if (st.critDmgAdd) s.critDmg += st.critDmgAdd;
    if (st.evaAdd) s.eva += st.evaAdd;
    if (st.lifestealAdd) s.lifesteal += st.lifestealAdd;
    if (st.counterAdd) s.counter += st.counterAdd;
    if (st.counterMul) s.counterMul = Math.max(s.counterMul, st.counterMul);
    if (st.thornsAdd) s.thorns += st.thornsAdd;
    if (st.thornsBase) s.thornsBase = true;
    if (st.armorAdd) s.armorMax += st.armorAdd;
    if (st.dmgReduce) s.dmgReduce = 1 - (1 - s.dmgReduce) * (1 - st.dmgReduce);
    if (st.armorDmgReduce) s.armorDmgReduce = Math.max(s.armorDmgReduce, st.armorDmgReduce);
    if (st.multiStrike) s.multiStrike += st.multiStrike;
    if (st.multiStrikeChain) s.multiStrikeChain = true;
    if (st.executeThreshold) {
      s.executeThreshold = Math.max(s.executeThreshold, st.executeThreshold);
      s.executeMul = Math.max(s.executeMul, st.executeMul || 1);
    }
    if (st.executeKill) s.executeKill = Math.max(s.executeKill, st.executeKill);
    if (st.firstHitMul) s.firstHitMul += st.firstHitMul;
    if (st.highHpDmg) { s.highHpDmg += st.highHpDmg; s.highHpThreshold = st.highHpThreshold ?? 0.5; }
    if (st.pressDmg) s.pressDmg += st.pressDmg;
    if (st.critPierce) s.critPierce = true;
    if (st.critOverflow) s.critOverflow = true;
    if (st.critLowHpMul) {
      s.critLowHpMul = Math.max(s.critLowHpMul, st.critLowHpMul);
      s.critLowHpThreshold = Math.max(s.critLowHpThreshold, st.critLowHpThreshold || 0);
    }
    if (st.lowHpAspd) s.lowHpAspd += st.lowHpAspd;
    if (st.lowHpLifestealMul) {
      s.lowHpLifestealMul = Math.max(s.lowHpLifestealMul, st.lowHpLifestealMul);
      s.lowHpLifestealThreshold = Math.max(s.lowHpLifestealThreshold, st.lowHpLifestealThreshold || 0);
    }
    if (st.rampAspd) { s.rampAspdStep = Math.max(s.rampAspdStep, st.rampAspd); s.rampAspdMax = Math.max(s.rampAspdMax, st.rampAspdMax || 0); }
    if (st.flurryCount) { s.flurryCount = st.flurryCount; s.flurryMul = Math.max(s.flurryMul, st.flurryMul || 1); }
    if (st.reviveOnce) s.reviveOnce = Math.max(s.reviveOnce, st.reviveOnce);
    if (st.critLifesteal) s.critLifesteal += st.critLifesteal;
    if (st.lifestealToAtk) { s.lifestealToAtk = st.lifestealToAtk; s.lifestealToAtkMax = st.lifestealToAtkMax || 0; }
  }

  // 전투 중 누적분
  atkMul += (ctx.stackAtk || 0) + (ctx.snowball || 0) + (ctx.lifestealAtk || 0);
  aspdMul += (ctx.stackAspd || 0) + (ctx.rampAspd || 0);
  s.crit += ctx.stackCrit || 0;

  s.atk = Math.max(0, base.atk * atkMul);
  s.aspd = Math.max(0.1, base.aspd * aspdMul);
  s.maxHp = Math.max(1, Math.round(base.maxHp * hpMul));

  // 넘치는 예리함 — 100% 를 넘은 치명타율을 배율로 바꾼다
  if (s.critOverflow && s.crit > 1) {
    s.critDmg += (s.crit - 1) * 2;
    s.crit = 1;
  }
  s.crit = Math.max(0, Math.min(s.crit, 1));
  s.eva = Math.max(0, Math.min(s.eva, 0.75));   // 무적 방지
  s.counter = Math.min(s.counter, 1);
  return s;
}

/** 지금 이 순간의 유효 공격속도 (잃은 체력 비례 가속 반영). */
export function effectiveAspd(stats, hp, maxHp) {
  if (!stats.lowHpAspd) return stats.aspd;
  const lostTenths = Math.floor((1 - hp / maxHp) * 10);
  const bonus = Math.min(0.54, stats.lowHpAspd * Math.max(0, lostTenths));
  return stats.aspd * (1 + bonus);
}

/** 지금 이 순간의 유효 흡혈률 (체력 낮을 때 증폭 반영). */
export function effectiveLifesteal(stats, hp, maxHp) {
  const low = stats.lowHpLifestealThreshold > 0 && hp / maxHp <= stats.lowHpLifestealThreshold;
  return stats.lifesteal * (low ? stats.lowHpLifestealMul : 1);
}

/**
 * 한 번의 공격을 해결한다. 다단히트·치명타·처형까지 전부 여기서 계산한다.
 * 순수 함수 — ctx 를 바꾸지 않고 새 ctx 를 돌려준다.
 *
 * @returns {{hits:Array, total:number, killed:boolean, ctx:object, healed:number}}
 */
export function resolveAttack(stats, ctx, target, self, rng) {
  const hits = [];
  let nextCtx = { ...ctx };
  let remainHp = target.hp;
  let healed = 0;

  // 즉시 처치 (균열)
  if (nextCtx.instantKillNext) {
    nextCtx.instantKillNext = false;
    hits.push({ damage: remainHp, crit: false, instant: true });
    return { hits, total: remainHp, killed: true, ctx: nextCtx, healed };
  }

  let strikes = 1;
  // 다단 히트 판정 (검의 폭포는 연쇄로 다시 굴린다)
  let chance = stats.multiStrike;
  let guard = 0;
  while (chance > 0 && rng.chance(Math.min(chance, 0.95)) && guard++ < 8) {
    strikes += 1;
    if (!stats.multiStrikeChain) break;
    chance *= 0.7;   // 연쇄는 점점 어려워진다 — 무한 루프 방지
  }

  for (let i = 0; i < strikes && remainHp > 0; i++) {
    // 참수·마무리 — 임계 이하면 곧바로 쓰러뜨린다
    if (stats.executeKill > 0 && remainHp / target.maxHp <= stats.executeKill) {
      hits.push({ damage: remainHp, crit: false, behead: true });
      remainHp = 0;
      break;
    }

    // 치명타 판정
    let critRate = stats.crit;
    if (stats.critLowHpThreshold > 0 && remainHp / target.maxHp <= stats.critLowHpThreshold) {
      critRate = Math.min(1, critRate * stats.critLowHpMul);
    }
    const crit = nextCtx.guaranteeCrit || rng.chance(critRate);
    if (nextCtx.guaranteeCrit) nextCtx.guaranteeCrit = false;

    let dmg = stats.atk * (crit ? stats.critDmg : 1);

    // 조건부 증폭
    if (stats.firstHitMul > 0 && !nextCtx.firstHitDone) dmg *= 1 + stats.firstHitMul;
    if (stats.highHpDmg > 0 && remainHp / target.maxHp > stats.highHpThreshold) dmg *= 1 + stats.highHpDmg;
    if (stats.pressDmg > 0 && self.hp / self.maxHp > remainHp / target.maxHp) dmg *= 1 + stats.pressDmg;
    if (stats.executeThreshold > 0 && remainHp / target.maxHp <= stats.executeThreshold) dmg *= stats.executeMul;
    if (nextCtx.slayerStack > 0) dmg *= 1 + nextCtx.slayerStack;
    if (nextCtx.pendingSplash > 0 && i === 0) { dmg += nextCtx.pendingSplash; nextCtx.pendingSplash = 0; }

    // 연쇄 타격 — 세 번 연속 명중하면 다음이 두 배
    nextCtx.flurryHits += 1;
    if (stats.flurryCount > 0 && nextCtx.flurryHits > stats.flurryCount) {
      dmg *= stats.flurryMul;
      nextCtx.flurryHits = 0;
    }

    dmg = Math.max(0, Math.round(dmg * 10) / 10);
    remainHp -= dmg;
    hits.push({ damage: dmg, crit, pierce: crit && stats.critPierce });

    // 몰아치기 — 같은 적을 때릴수록 빨라진다
    if (stats.rampAspdStep > 0) {
      nextCtx.rampAspd = Math.min(stats.rampAspdMax, nextCtx.rampAspd + stats.rampAspdStep);
    }
    nextCtx.firstHitDone = true;

    // 치명타 시 발동은 호출자가 처리한다 (회복·보호막은 self 상태를 건드리므로)
  }

  const total = hits.reduce((a, h) => a + h.damage, 0);
  return { hits, total, killed: remainHp <= 0, ctx: nextCtx, healed };
}

/**
 * 피격을 해결한다. 보호막이 체력보다 먼저 닳는다.
 * @returns {{armor, hp, evaded, absorbed, taken, thorns}}
 */
export function resolveDamage(stats, armor, hp, incoming, rng) {
  if (rng.chance(stats.eva)) {
    return { armor, hp, evaded: true, absorbed: 0, taken: 0, thorns: 0 };
  }
  let dmg = Math.max(0, incoming);
  dmg *= 1 - stats.dmgReduce;
  if (armor > 0 && stats.armorDmgReduce > 0) dmg *= 1 - stats.armorDmgReduce;
  dmg = Math.round(dmg * 10) / 10;

  const absorbed = Math.min(armor, dmg);
  const rest = dmg - absorbed;
  const thorns = stats.thorns > 0
    ? Math.round((stats.thornsBase ? incoming : dmg) * stats.thorns * 10) / 10
    : 0;

  return { armor: armor - absorbed, hp: hp - rest, evaded: false, absorbed, taken: dmg, thorns };
}

/** 반격 피해. 반격이 안 터지면 0. */
export function resolveCounter(stats, rng, forced = false) {
  if (!forced && !rng.chance(stats.counter)) return 0;
  if (!forced && stats.counter <= 0) return 0;
  return Math.round(stats.atk * stats.counterMul * 10) / 10;
}

/** 회복. 최대치를 넘지 않는다. */
export function heal(hp, maxHp, amount) {
  return Math.min(maxHp, hp + Math.max(0, amount));
}

/**
 * 피의 순환 — 흡혈로 실제 회복이 일어났을 때 공격력 누적을 올린다.
 * 이 함수를 호출하지 않으면 그 퍽은 정의만 있고 동작하지 않는다.
 */
export function applyLifestealGain(stats, ctx, healedAmount) {
  if (!stats.lifestealToAtk || healedAmount <= 0) return ctx;
  const next = Math.min(stats.lifestealToAtkMax, (ctx.lifestealAtk || 0) + stats.lifestealToAtk);
  return { ...ctx, lifestealAtk: next };
}

/** 관통하는 시선 — 치명타가 보호막을 무시하는가. */
export function critIgnoresArmor(stats) {
  return !!stats.critPierce;
}

/** 보호막 회복. 최대치를 넘지 않는다. */
export function repairArmor(armor, maxArmor, amount) {
  return Math.min(maxArmor, armor + Math.max(0, amount));
}

/** 적 처치로 얻는 경험치. 챕터가 오를수록 늘어난다. */
export function expFromKill(chapter) {
  const r = BALANCE.런;
  return Math.round(r.적_처치_기본EXP * Math.pow(r.적_처치_EXP_챕터계수, chapter - 1));
}
