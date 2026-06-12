// レースバランス検証: 脚質ごとの勝率が偏ってないかチェックする
// 実行: npx tsx scripts/simulate.mjs
import { generateRace, horseSpeed } from "../app/data.ts";

const N = 3000;
const distance = 2000;
const wins = { 逃げ: 0, 先行: 0, 差し: 0, 追込: 0 };
const runs = { 逃げ: 0, 先行: 0, 差し: 0, 追込: 0 };
const top3 = { 逃げ: 0, 先行: 0, 差し: 0, 追込: 0 };
let favWins = 0;
let favProbSum = 0;
let winnerOddsSum = 0;

for (let r = 0; r < N; r++) {
  const { horses } = generateRace(Math.floor(Math.random() * 1e9), distance);
  horses.forEach((h) => runs[h.style]++);
  let simT = 0;
  const dt = 0.1;
  const fin = new Map();
  while (fin.size < horses.length && simT < 400) {
    simT += dt;
    for (const h of horses) {
      if (fin.has(h.num)) continue;
      const progress = h.pos / distance;
      h.pos += horseSpeed(h, progress, simT) * dt;
      if (h.pos >= distance) fin.set(h.num, simT);
    }
  }
  const order = [...horses].sort(
    (a, b) => (fin.get(a.num) ?? 999) - (fin.get(b.num) ?? 999)
  );
  wins[order[0].style]++;
  order.slice(0, 3).forEach((h) => top3[h.style]++);
  const fav = [...horses].sort((a, b) => a.odds - b.odds)[0];
  if (order[0].num === fav.num) favWins++;
  favProbSum += fav.prob;
  winnerOddsSum += order[0].odds;
}

console.log(`=== ${N}レース(芝${distance}m) シミュレーション結果 ===`);
for (const s of Object.keys(wins)) {
  console.log(
    `${s}: 出走${runs[s]}頭 → 勝率 ${((wins[s] / runs[s]) * 100).toFixed(1)}% / 複勝率 ${((top3[s] / runs[s]) * 100).toFixed(1)}%`
  );
}
console.log(`1番人気の勝率: ${((favWins / N) * 100).toFixed(1)}%`);
console.log(
  `1番人気のモデル想定勝率: ${((favProbSum / N) * 100).toFixed(1)}% (実勝率と近いほどオッズが妥当)`
);
console.log(`勝ち馬の平均単勝オッズ: ${(winnerOddsSum / N).toFixed(1)}倍`);
