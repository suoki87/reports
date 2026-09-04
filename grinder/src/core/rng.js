// 결정적 난수. 같은 시드면 언제나 같은 수열이 나온다.
//
// 왜 Math.random 을 안 쓰나: 밸런스를 테스트하려면 재현이 돼야 한다.
// "가끔 죽는다" 는 버그는 재현 없이는 절대 못 잡는다.

/** mulberry32 — 작고 빠르고 품질이 충분한 32비트 PRNG. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.chance = (p) => next() < p;
  /** 배열에서 중복 없이 n 개 뽑기 */
  next.pick = (arr, n) => {
    const pool = arr.slice();
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(next.int(pool.length), 1)[0]);
    return out;
  };
  /** 가중치 있는 선택. weights 는 키->확률 객체 */
  next.weighted = (weights) => {
    const r = next();
    let acc = 0;
    for (const [k, w] of Object.entries(weights)) {
      acc += w;
      if (r < acc) return k;
    }
    return Object.keys(weights)[Object.keys(weights).length - 1];
  };
  return next;
}
