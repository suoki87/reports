// 런(한 판) 상태 전이. 순수 함수 — 상태를 받아 새 상태를 돌려준다.
//
// 디렉터 확인 (2026-09-04): 죽으면 챕터 처음부터 다시 시작한다.
// 그래서 이 파일의 가장 중요한 불변식은 "죽으면 전부 리셋" 이다.
//
// 불변식 (tests/test_run.mjs 가 지킨다):
//   - 죽으면 스테이지 1, 레벨 1, 퍽 0개로 돌아간다
//   - 레벨업 시 퍽을 정확히 3개 제시한다
//   - 이미 고른 퍽은 다시 제시되지 않는다
//   - 스테이지는 1 부터 순차로만 오른다
//   - 경험치가 넘치면 연속 레벨업이 처리된다

import { BALANCE, expForLevel, enemyHp, enemyAtk, isBoss } from './balance.js';
import { expFromKill } from './combat.js';
import { rollPerks } from './perks.js';

/** 새 런 상태. 챕터 처음부터 시작한다. */
export function newRun(chapter = 1) {
  const init = BALANCE.플레이어초기값;
  return {
    chapter,
    stage: 1,
    level: 1,
    exp: 0,
    perks: [],
    stacks: { atk: 0 },
    hp: init.HP,
    armor: init.보호막,
    stageKills: 0,   // 이번 스테이지에서 처치한 수
    kills: 0,
    coins: 0,
    elapsed: 0,
    over: false,
    pendingPerks: null,   // 퍽 선택 대기 중이면 배열
  };
}

/** 레벨업 기본 성장이 반영된 기본 스탯. */
export function baseStats(run) {
  const init = BALANCE.플레이어초기값;
  const grow = BALANCE.레벨업_기본성장;
  const lv = run.level - 1;
  return {
    atk: init.ATK + grow.ATK * lv,
    aspd: init.공격속도,
    maxHp: init.HP + grow.HP * lv,
    crit: init.치명타율,
    critDmg: init.치명타배율,
    eva: init.회피율,
    lifesteal: init.흡혈률,
  };
}

/** 이번 스테이지에 나올 적의 총 수. 보스 스테이지는 보스 하나뿐이다. */
export function stageEnemyCount(run) {
  const c = BALANCE.챕터;
  return isBoss(run.stage) ? c.보스_스테이지_적수 : c.스테이지당_적수;
}

/** 현재 스테이지의 적. */
export function currentEnemy(run) {
  return {
    maxHp: enemyHp(run.chapter, run.stage),
    atk: enemyAtk(run.chapter, run.stage),
    boss: isBoss(run.stage),
  };
}

/**
 * 경험치를 준다. 넘치면 연속 레벨업까지 처리하고 퍽 선택을 띄운다.
 * 순수 함수 — 새 run 을 돌려준다.
 */
export function gainExp(run, amount, rng) {
  let { level, exp } = run;
  exp += amount;
  let leveled = 0;
  while (exp >= expForLevel(level) && level < BALANCE.레벨.최대레벨) {
    exp -= expForLevel(level);
    level += 1;
    leveled += 1;
  }
  if (!leveled) return { ...run, exp };

  const next = { ...run, level, exp };
  // 레벨업으로 최대 체력이 오르면 그만큼 현재 체력도 올려 준다
  const hpGain = BALANCE.레벨업_기본성장.HP * leveled;
  next.hp = run.hp + hpGain;
  // 퍽 풀이 동나면 선택을 띄우지 않는다.
  // 빈 배열을 그대로 넘기면 "고를 게 없는 선택 화면" 에서 게임이 멈춘다.
  const rolled = rollPerks(rng, BALANCE.퍽.등급확률, run.perks, BALANCE.퍽.선택지_수);
  next.pendingPerks = rolled.length ? rolled : null;
  return next;
}

/** 퍽을 고른다. 대기 상태를 해제한다. */
export function choosePerk(run, perk) {
  return { ...run, perks: [...run.perks, perk], pendingPerks: null };
}

/** 적을 처치했다. 스테이지를 올리고 보상을 준다. */
export function killEnemy(run, rng) {
  const next = {
    ...run,
    kills: run.kills + 1,
    coins: run.coins + 1 + Math.floor(run.chapter * 0.5),
  };
  // 연쇄 퍽 누적
  for (const p of run.perks) {
    if (p.trigger?.on === 'kill' && p.trigger.stackAtk) {
      next.stacks = { ...next.stacks, atk: (next.stacks.atk || 0) + p.trigger.stackAtk };
    }
  }
  next.stageKills = (run.stageKills || 0) + 1;
  const withExp = gainExp(next, expFromKill(run.chapter), rng);

  // 이번 스테이지의 적을 다 잡아야 다음 스테이지로 간다
  if (withExp.stageKills < stageEnemyCount(run)) {
    return withExp;
  }
  // 마지막 스테이지를 깨면 챕터 클리어
  const last = BALANCE.챕터.챕터당_스테이지수;
  if (withExp.stage >= last) {
    return { ...withExp, cleared: true };
  }
  return { ...withExp, stage: withExp.stage + 1, stageKills: 0 };
}

/**
 * 죽었다. **챕터 처음부터 다시 시작한다** — 디렉터 확인 사항.
 * 남는 것은 아무것도 없다. 통계만 넘긴다.
 */
export function die(run) {
  return {
    ...newRun(run.chapter),
    over: true,
    lastRun: {
      stage: run.stage,
      level: run.level,
      kills: run.kills,
      coins: run.coins,
      perks: run.perks.map((p) => p.이름),
      elapsed: run.elapsed,
    },
  };
}
