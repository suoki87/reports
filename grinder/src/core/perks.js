// 퍽 60종.
//
// 설계 원칙은 docs/PERK_DESIGN.md 에 있다. 요약하면:
//   - 다섯 축(치명타·연타·반격·흡혈·처형)으로 빌드가 갈린다
//   - 축마다 씨앗 -> 증폭 -> 전환 세 단계가 있어 퍽끼리 엮인다
//   - 일반은 밋밋, 희귀는 조건부, 전설은 규칙을 바꾼다
//   - 대가형 퍽이 계산을 강제한다
//
// 문구는 전부 새로 썼다. 레퍼런스에서 옮기지 않았다.
//
// 효과 필드는 combat.js 가 해석한다. 새 필드를 추가하면 반드시
// combat.js 와 tests/test_perks.mjs 를 같이 고친다 — 정의만 있고
// 동작하지 않는 퍽은 데이터가 아니라 거짓말이다.

export const 축 = {
  치명타: '치명타', 연타: '연타', 반격: '반격', 흡혈: '흡혈', 처형: '처형',
};

export const PERK_POOL = [
  // ═══════════════════════════════════════════════════════
  // 치명타 — 가끔 크게 때린다. 약점: 운에 흔들린다
  // ═══════════════════════════════════════════════════════
  { id: 'crit_seed', 등급: '일반', 축: '치명타', 단계: '씨앗',
    이름: '급소 보기', 설명: '치명타율 +8%p',
    stat: { critAdd: 0.08 } },

  { id: 'crit_edge', 등급: '일반', 축: '치명타', 단계: '씨앗',
    이름: '날카로운 눈', 설명: '치명타율 +5%p, 공격력 +8%',
    stat: { critAdd: 0.05, atkMul: 0.08 } },

  { id: 'crit_dmg', 등급: '일반', 축: '치명타', 단계: '증폭',
    이름: '무자비', 설명: '치명타 배율 +90%p',
    stat: { critDmgAdd: 0.90 } },

  { id: 'crit_heal', 등급: '일반', 축: '치명타', 단계: '전환',
    이름: '피의 각인', 설명: '치명타 시 체력 4% 회복',
    trigger: { on: 'crit', chance: 1, healPct: 0.04 } },

  { id: 'crit_armor', 등급: '일반', 축: '치명타', 단계: '전환',
    이름: '단단해지는 확신', 설명: '치명타 시 보호막 6 회복',
    trigger: { on: 'crit', chance: 1, armorFlat: 6 } },

  { id: 'crit_pierce', 등급: '일반', 축: '치명타', 단계: '전환',
    이름: '관통하는 시선', 설명: '치명타가 보호막을 무시하고 체력을 직접 깎는다',
    stat: { critPierce: true, critDmgAdd: 0.20 } },

  { id: 'crit_stack', 등급: '희귀', 축: '치명타', 단계: '증폭',
    이름: '연속 급소', 설명: '치명타할 때마다 치명타율 +3%p (이번 판 내내 누적)',
    trigger: { on: 'crit', chance: 1, stackCrit: 0.03 } },

  { id: 'crit_hunter', 등급: '희귀', 축: '치명타', 단계: '조건',
    이름: '사냥꾼의 눈', 설명: '치명타율 +6%p. 체력 40% 이하 적에게는 두 배',
    stat: { critAdd: 0.06, critLowHpMul: 2, critLowHpThreshold: 0.40 } },

  { id: 'crit_gamble', 등급: '희귀', 축: '치명타', 단계: '대가',
    이름: '치명적 반동', 설명: '치명타 배율 +150%p, 치명타율 −3%p',
    stat: { critDmgAdd: 1.50, critAdd: -0.03 } },

  { id: 'crit_chain', 등급: '희귀', 축: '치명타', 단계: '전환',
    이름: '이어지는 균열', 설명: '치명타 시 다음 공격도 치명타로 터진다',
    trigger: { on: 'crit', chance: 1, guaranteeNextCrit: true } },

  { id: 'crit_master', 등급: '전설', 축: '치명타', 단계: '증폭',
    이름: '급소만 노린다', 설명: '치명타율 +25%p, 치명타 배율 +80%p',
    stat: { critAdd: 0.25, critDmgAdd: 0.80 } },

  { id: 'crit_overflow', 등급: '전설', 축: '치명타', 단계: '규칙변경',
    이름: '넘치는 예리함', 설명: '치명타율이 100%를 넘으면 넘친 만큼 치명타 배율로 바뀐다',
    stat: { critOverflow: true, critAdd: 0.15 } },

  // ═══════════════════════════════════════════════════════
  // 연타 — 자주 때린다. 약점: 한 방이 약하다
  // ═══════════════════════════════════════════════════════
  { id: 'haste_seed', 등급: '일반', 축: '연타', 단계: '씨앗',
    이름: '가벼운 손목', 설명: '공격속도 +12%',
    stat: { aspdMul: 0.12 } },

  { id: 'haste_trained', 등급: '일반', 축: '연타', 단계: '씨앗',
    이름: '숙련된 손', 설명: '공격속도 +8%, 치명타율 +3%p',
    stat: { aspdMul: 0.08, critAdd: 0.03 } },

  { id: 'haste_double', 등급: '일반', 축: '연타', 단계: '증폭',
    이름: '잔영', 설명: '20% 확률로 한 번 더 때린다',
    stat: { multiStrike: 0.20 } },

  { id: 'haste_ramp', 등급: '일반', 축: '연타', 단계: '증폭',
    이름: '몰아치기', 설명: '한 적을 때릴 때마다 공격속도 +5% (최대 +40%)',
    stat: { rampAspd: 0.05, rampAspdMax: 0.40 } },

  { id: 'haste_rush', 등급: '일반', 축: '연타', 단계: '대가',
    이름: '조급함', 설명: '공격속도 +22%, 공격력 −8%',
    stat: { aspdMul: 0.22, atkMul: -0.08 } },

  { id: 'haste_kill', 등급: '일반', 축: '연타', 단계: '전환',
    이름: '흐르는 검', 설명: '적을 처치하면 다음 공격을 즉시 한다',
    trigger: { on: 'kill', chance: 1, instantAttack: true } },

  { id: 'haste_storm', 등급: '희귀', 축: '연타', 단계: '증폭',
    이름: '폭풍의 검', 설명: '40% 확률로 한 번 더 때린다',
    stat: { multiStrike: 0.40 } },

  { id: 'haste_desperate', 등급: '희귀', 축: '연타', 단계: '조건',
    이름: '가속하는 심장', 설명: '잃은 체력 10%마다 공격속도 +6% (최대 +54%)',
    stat: { lowHpAspd: 0.06 } },

  { id: 'haste_stack', 등급: '희귀', 축: '연타', 단계: '전환',
    이름: '끝나지 않는 검격', 설명: '적을 처치할 때마다 공격속도 +4% (이번 판 내내 누적)',
    trigger: { on: 'kill', chance: 1, stackAspd: 0.04 } },

  { id: 'haste_flurry', 등급: '희귀', 축: '연타', 단계: '조건',
    이름: '연쇄 타격', 설명: '세 번 연속 명중하면 다음 공격 피해가 두 배',
    stat: { flurryCount: 3, flurryMul: 2 } },

  { id: 'haste_time', 등급: '전설', 축: '연타', 단계: '증폭',
    이름: '시간의 틈', 설명: '공격속도 +35%',
    stat: { aspdMul: 0.35 } },

  { id: 'haste_cascade', 등급: '전설', 축: '연타', 단계: '규칙변경',
    이름: '검의 폭포', 설명: '35% 확률로 한 번 더 때리고, 그 추가 타격도 다시 터질 수 있다',
    stat: { multiStrike: 0.35, multiStrikeChain: true } },

  // ═══════════════════════════════════════════════════════
  // 반격 — 맞으면서 되돌려준다. 약점: 맞아야 발동한다
  // ═══════════════════════════════════════════════════════
  { id: 'riposte_seed', 등급: '일반', 축: '반격', 단계: '씨앗',
    이름: '되받아치기', 설명: '반격률 +22%p',
    stat: { counterAdd: 0.22 } },

  { id: 'riposte_thorns', 등급: '일반', 축: '반격', 단계: '씨앗',
    이름: '가시 갑옷', 설명: '받은 피해의 60%를 돌려준다',
    stat: { thornsAdd: 0.60 } },

  { id: 'riposte_eva', 등급: '일반', 축: '반격', 단계: '씨앗',
    이름: '잔발', 설명: '회피율 +7%p',
    stat: { evaAdd: 0.07 } },

  { id: 'riposte_tough', 등급: '일반', 축: '반격', 단계: '증폭',
    이름: '굳은 살', 설명: '받는 피해 −10%',
    stat: { dmgReduce: 0.10 } },

  { id: 'riposte_armor', 등급: '일반', 축: '반격', 단계: '씨앗',
    이름: '견고함', 설명: '보호막 최대치 +70',
    stat: { armorAdd: 70 } },

  { id: 'riposte_evade_heal', 등급: '일반', 축: '반격', 단계: '전환',
    이름: '숨 돌리기', 설명: '회피에 성공하면 체력 8% 회복',
    trigger: { on: 'evade', chance: 1, healPct: 0.08 } },

  { id: 'riposte_vengeance', 등급: '희귀', 축: '반격', 단계: '증폭',
    이름: '복수의 칼날', 설명: '반격률 +18%p, 반격 피해가 세 배',
    stat: { counterAdd: 0.18, counterMul: 3 } },

  { id: 'riposte_evade_hit', 등급: '희귀', 축: '반격', 단계: '전환',
    이름: '스치는 칼', 설명: '회피율 +8%p. 회피하면 곧바로 반격한다',
    stat: { evaAdd: 0.08 },
    trigger: { on: 'evade', chance: 1, counterAttack: true } },

  { id: 'riposte_crown', 등급: '희귀', 축: '반격', 단계: '증폭',
    이름: '가시 왕관', 설명: '돌려주는 피해 +150%, 반격률 +18%p',
    stat: { thornsAdd: 1.5, counterAdd: 0.18 } },

  { id: 'riposte_wall', 등급: '희귀', 축: '반격', 단계: '조건',
    이름: '벽', 설명: '보호막 +60. 보호막이 남아 있으면 받는 피해 −30%',
    stat: { armorAdd: 60, armorDmgReduce: 0.30 } },

  { id: 'riposte_mirror', 등급: '전설', 축: '반격', 단계: '규칙변경',
    이름: '거울 방패', 설명: '받은 피해의 두 배를 돌려준다',
    stat: { thornsAdd: 2.0, thornsBase: true } },

  { id: 'riposte_flawless', 등급: '전설', 축: '반격', 단계: '전환',
    이름: '무결점', 설명: '회피에 성공하면 체력 14% 회복하고 곧바로 반격한다',
    trigger: { on: 'evade', chance: 1, healPct: 0.14, counterAttack: true } },

  // ═══════════════════════════════════════════════════════
  // 흡혈 — 때리며 회복한다. 약점: 화력이 낮으면 회복도 낮다
  // ═══════════════════════════════════════════════════════
  { id: 'vamp_seed', 등급: '일반', 축: '흡혈', 단계: '씨앗',
    이름: '갈증', 설명: '준 피해의 4%를 회복한다',
    stat: { lifestealAdd: 0.04 } },

  { id: 'vamp_hp', 등급: '일반', 축: '흡혈', 단계: '씨앗',
    이름: '두꺼운 가죽', 설명: '최대 체력 +20%',
    stat: { hpMul: 0.20 } },

  { id: 'vamp_kill_heal', 등급: '일반', 축: '흡혈', 단계: '전환',
    이름: '피의 보상', 설명: '적을 처치하면 25% 확률로 체력 9% 회복',
    trigger: { on: 'kill', chance: 0.25, healPct: 0.09 } },

  { id: 'vamp_stage_heal', 등급: '일반', 축: '흡혈', 단계: '전환',
    이름: '회복의 숨', 설명: '스테이지를 넘어갈 때 체력 7% 회복',
    trigger: { on: 'stage', chance: 1, healPct: 0.07 } },

  { id: 'vamp_stout', 등급: '일반', 축: '흡혈', 단계: '증폭',
    이름: '강인함', 설명: '최대 체력 +14%, 받는 피해 −6%',
    stat: { hpMul: 0.14, dmgReduce: 0.06 } },

  { id: 'vamp_trade', 등급: '일반', 축: '흡혈', 단계: '대가',
    이름: '생명 전환', 설명: '최대 체력 15%를 잃고 공격력 +28%',
    stat: { hpMul: -0.15, atkMul: 0.28 } },

  { id: 'vamp_deep', 등급: '희귀', 축: '흡혈', 단계: '증폭',
    이름: '흡혈귀', 설명: '준 피해의 8%를 회복한다',
    stat: { lifestealAdd: 0.08 } },

  { id: 'vamp_last', 등급: '희귀', 축: '흡혈', 단계: '조건',
    이름: '마지막 숨', 설명: '흡혈 +3%. 체력 30% 아래에서는 흡혈이 두 배',
    stat: { lifestealAdd: 0.03, lowHpLifestealMul: 2, lowHpLifestealThreshold: 0.30 } },

  { id: 'vamp_revive', 등급: '희귀', 축: '흡혈', 단계: '규칙변경',
    이름: '불굴', 설명: '치명상을 한 번 버티고 체력 35%로 일어난다 (판당 1회)',
    stat: { reviveOnce: 0.35 } },

  { id: 'vamp_surge', 등급: '희귀', 축: '흡혈', 단계: '전환',
    이름: '피의 순환', 설명: '흡혈 +3%. 회복할 때마다 공격력 +1% (최대 +30%)',
    stat: { lifestealAdd: 0.03, lifestealToAtk: 0.01, lifestealToAtkMax: 0.30 } },

  { id: 'vamp_immortal', 등급: '전설', 축: '흡혈', 단계: '증폭',
    이름: '불사', 설명: '준 피해의 12%를 회복하고, 최대 체력 +25%',
    stat: { lifestealAdd: 0.12, hpMul: 0.25 } },

  { id: 'vamp_river', 등급: '전설', 축: '흡혈', 단계: '규칙변경',
    이름: '생명의 강', 설명: '치명타 피해의 30%를 회복한다',
    stat: { critLifesteal: 0.30 } },

  // ═══════════════════════════════════════════════════════
  // 처형 — 약해진 적을 끝낸다. 약점: 깎기 전까지 아무 일도 없다
  // ═══════════════════════════════════════════════════════
  { id: 'exec_seed', 등급: '일반', 축: '처형', 단계: '씨앗',
    이름: '처형', 설명: '체력 25% 이하인 적에게 주는 피해가 두 배',
    stat: { executeThreshold: 0.25, executeMul: 2 } },

  { id: 'exec_first', 등급: '일반', 축: '처형', 단계: '씨앗',
    이름: '첫 일격', 설명: '새로운 적에게 주는 첫 공격 피해 +80%',
    stat: { firstHitMul: 0.80 } },

  { id: 'exec_hunt', 등급: '일반', 축: '처형', 단계: '조건',
    이름: '사냥 본능', 설명: '체력이 절반 넘게 남은 적에게 주는 피해 +22%',
    stat: { highHpDmg: 0.22, highHpThreshold: 0.50 } },

  { id: 'exec_chain', 등급: '일반', 축: '처형', 단계: '증폭',
    이름: '연쇄', 설명: '적을 처치할 때마다 공격력 +3% (이번 판 내내 누적)',
    trigger: { on: 'kill', chance: 1, stackAtk: 0.03 } },

  { id: 'exec_burst', 등급: '일반', 축: '처형', 단계: '전환',
    이름: '터지는 최후', 설명: '적을 처치하면 다음 적에게 처치한 적 최대 체력의 25%만큼 피해',
    trigger: { on: 'kill', chance: 1, splash: 0.25 } },

  { id: 'exec_press', 등급: '일반', 축: '처형', 단계: '조건',
    이름: '압도', 설명: '내 체력 비율이 적보다 높으면 주는 피해 +18%',
    stat: { pressDmg: 0.18 } },

  { id: 'exec_slayer', 등급: '희귀', 축: '처형', 단계: '증폭',
    이름: '학살자', 설명: '처치할 때마다 주는 피해 +25% (최대 +150%)',
    trigger: { on: 'kill', chance: 1, slayerStack: 0.25, slayerMax: 1.50 } },

  { id: 'exec_rift', 등급: '희귀', 축: '처형', 단계: '전환',
    이름: '균열', 설명: '적을 처치하면 22% 확률로 다음 적도 즉시 쓰러뜨린다',
    trigger: { on: 'kill', chance: 0.22, instantKill: true } },

  { id: 'exec_omen', 등급: '희귀', 축: '처형', 단계: '전환',
    이름: '파멸의 전조', 설명: '적을 처치할 때마다 치명타율 +2%p (이번 판 내내 누적)',
    trigger: { on: 'kill', chance: 1, stackCrit: 0.02 } },

  { id: 'exec_finish', 등급: '희귀', 축: '처형', 단계: '규칙변경',
    이름: '마무리', 설명: '공격력 +10%. 체력 20% 이하 적을 곧바로 쓰러뜨린다',
    stat: { atkMul: 0.10, executeKill: 0.20 } },

  { id: 'exec_behead', 등급: '전설', 축: '처형', 단계: '규칙변경',
    이름: '참수', 설명: '공격력 +15%. 체력 32% 이하 적을 곧바로 쓰러뜨린다',
    stat: { atkMul: 0.15, executeKill: 0.32 } },

  { id: 'exec_snowball', 등급: '전설', 축: '처형', 단계: '대가',
    이름: '눈덩이', 설명: '처치할 때마다 공격력 +9% 쌓이지만, 피격당하면 절반이 무너진다',
    trigger: { on: 'kill', chance: 1, snowballAtk: 0.09, snowballLossOnHit: 0.5 } },
];

/** 등급별 개수 — 감사 도구가 쓴다. */
export function poolSummary() {
  const by = (key) => PERK_POOL.reduce((m, p) => {
    m[p[key]] = (m[p[key]] || 0) + 1;
    return m;
  }, {});
  return { 총: PERK_POOL.length, 등급별: by('등급'), 축별: by('축'), 단계별: by('단계') };
}

/**
 * 레벨업 시 제시할 퍽 n 개를 뽑는다. 순수 함수 — rng 를 받는다.
 *
 * 불변식:
 *   - 이미 고른 퍽은 다시 안 나온다
 *   - 제시된 것끼리 중복이 없다
 *   - 풀이 모자라면 남은 만큼만 준다 (빈 배열도 가능 — 호출자가 처리한다)
 */
export function rollPerks(rng, gradeWeights, taken, n = 3) {
  const takenIds = new Set(taken.map((p) => p.id));
  const available = PERK_POOL.filter((p) => !takenIds.has(p.id));
  if (available.length <= n) return available.slice();

  const picked = [];
  const usedIds = new Set();
  let guard = 0;
  while (picked.length < n && guard++ < 400) {
    const grade = rng.weighted(gradeWeights);
    const pool = available.filter((p) => p.등급 === grade && !usedIds.has(p.id));
    const from = pool.length ? pool : available.filter((p) => !usedIds.has(p.id));
    if (!from.length) break;
    const chosen = from[rng.int(from.length)];
    usedIds.add(chosen.id);
    picked.push(chosen);
  }
  return picked;
}
