// 歴代の名馬たち
export const LEGEND_HORSES = [
  "ディープインパクト",
  "オグリキャップ",
  "シンボリルドルフ",
  "ナリタブライアン",
  "トウカイテイオー",
  "メジロマックイーン",
  "サイレンススズカ",
  "スペシャルウィーク",
  "グラスワンダー",
  "エルコンドルパサー",
  "テイエムオペラオー",
  "キタサンブラック",
  "アーモンドアイ",
  "イクイノックス",
  "オルフェーヴル",
  "ジェンティルドンナ",
  "ウオッカ",
  "ダイワスカーレット",
  "ゴールドシップ",
  "ミホノブルボン",
  "ライスシャワー",
  "セイウンスカイ",
  "キングヘイロー",
  "マヤノトップガン",
  "エアグルーヴ",
  "ヒシアマゾン",
  "タイキシャトル",
  "ロードカナロア",
  "コントレイル",
  "ソダシ",
  "デアリングタクト",
  "ブエナビスタ",
  "ジャングルポケット",
  "マルゼンスキー",
  "テンポイント",
  "ハイセイコー",
  "ミスターシービー",
  "ビワハヤヒデ",
  "ナリタタイシン",
  "ハルウララ",
];

export const RACE_NAMES = [
  "ロイヤルカップ",
  "ゴールデンステークス",
  "サンライズ記念",
  "スターライト杯",
  "レジェンド記念",
  "クラシックトロフィー",
  "グランプリ大賞典",
  "オールスター特別",
];

export const STYLES = ["逃げ", "先行", "差し", "追込"] as const;
export type RunStyle = (typeof STYLES)[number];

// 枠番カラー(JRA準拠)
export const WAKU_COLORS = [
  "#ffffff",
  "#1f1f1f",
  "#e3342f",
  "#2563eb",
  "#f5d513",
  "#16a34a",
  "#f97316",
  "#f472b6",
];
export const WAKU_TEXT = [
  "#1f1f1f",
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#1f1f1f",
  "#ffffff",
  "#ffffff",
  "#1f1f1f",
];

// 馬体の毛色バリエーション
export const COAT_COLORS = [
  "#5a3a23", // 鹿毛
  "#3b2a1d", // 黒鹿毛
  "#26211e", // 青鹿毛
  "#8b5a33", // 栗毛
  "#a3683a", // 栃栗毛
  "#9a8c84", // 芦毛
  "#6e4a2a", // 鹿毛(濃)
  "#4a3320", // 黒鹿毛(濃)
];

export interface Horse {
  num: number; // 馬番 1-8
  name: string;
  ability: number; // 基礎能力
  style: RunStyle;
  odds: number; // 単勝オッズ
  prob: number; // 勝率(内部)
  coat: string;
  // レース中の状態
  pos: number;
  finishTime: number | null;
  form: number; // 当日の調子(隠しパラメータ)
  spurt: number; // 末脚
  noiseSeed: number;
}

export type BetType = "win" | "place" | "quinella";

export const BET_LABEL: Record<BetType, string> = {
  win: "単勝",
  place: "複勝",
  quinella: "馬連",
};

export interface Bet {
  playerIdx: number;
  type: BetType;
  horses: number[]; // 馬番
  amount: number;
}

export interface Player {
  name: string;
  balance: number;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRace(seed: number, distance: number) {
  const rand = mulberry32(seed);
  const pool = [...LEGEND_HORSES];
  const horses: Horse[] = [];
  // 末脚の強さは脚質依存(差し・追込ほどキレる)
  const SPURT_RANGE: Record<RunStyle, [number, number]> = {
    逃げ: [0.15, 0.75],
    先行: [0.3, 0.95],
    差し: [0.55, 1.35],
    追込: [0.65, 1.55],
  };
  for (let i = 0; i < 8; i++) {
    const idx = Math.floor(rand() * pool.length);
    const name = pool.splice(idx, 1)[0];
    const style = STYLES[Math.floor(rand() * STYLES.length)];
    const [sLo, sHi] = SPURT_RANGE[style];
    horses.push({
      num: i + 1,
      name,
      ability: 68 + rand() * 24,
      style,
      odds: 0,
      prob: 0,
      coat: COAT_COLORS[Math.floor(rand() * COAT_COLORS.length)],
      pos: 0,
      finishTime: null,
      form: (rand() - 0.5) * 1.0,
      spurt: sLo + rand() * (sHi - sLo),
      noiseSeed: rand() * 1000,
    });
  }
  // 単勝オッズ: 能力ベースのソフトマックス + 控除率20%
  const tau = 4.5;
  const exps = horses.map((h) => Math.exp(h.ability / tau));
  const sum = exps.reduce((a, b) => a + b, 0);
  horses.forEach((h, i) => {
    h.prob = exps[i] / sum;
    h.odds = Math.max(1.1, Math.round((0.8 / h.prob) * 10) / 10);
  });
  const raceName = RACE_NAMES[Math.floor(rand() * RACE_NAMES.length)];
  const raceNo = 1 + Math.floor(rand() * 11);
  const grade = distance >= 2000 ? "G I" : distance >= 1600 ? "G II" : "G III";
  return {
    horses,
    title: `第${raceNo}R ${raceName} (${grade}) 芝${distance}m`,
    raceName,
    raceNo,
    grade,
  };
}

export type RaceInfo = ReturnType<typeof generateRace>;

export function placeOdds(winOdds: number) {
  return Math.max(1.1, Math.round((1 + (winOdds - 1) * 0.25) * 10) / 10);
}

export function quinellaOdds(a: Horse, b: Horse) {
  const pq =
    a.prob * (b.prob / (1 - a.prob)) + b.prob * (a.prob / (1 - b.prob));
  return Math.max(1.1, Math.round((0.775 / pq) * 10) / 10);
}

export function styleMod(style: RunStyle, progress: number) {
  // レース展開: 序盤(〜30%)で隊列形成、終盤(70%〜)は末脚勝負。
  // 脚質ごとの損得が(末脚込みで)ほぼゼロサムになるよう係数を調整してある。
  const early = progress < 0.3 ? 1 : progress < 0.5 ? (0.5 - progress) / 0.2 : 0;
  const late = progress > 0.7 ? Math.min(1, (progress - 0.7) / 0.15) : 0;
  switch (style) {
    case "逃げ":
      return early * 1.1 - late * 1.55;
    case "先行":
      return early * 0.5 - late * 0.85;
    case "差し":
      return early * -0.55 + late * 0.9;
    case "追込":
      return early * -1.05 + late * 1.95;
  }
}

// レース中の馬速(m/s)。アプリ本体とシミュレータで共通利用
export function horseSpeed(h: Horse, progress: number, simT: number) {
  let v =
    15.9 +
    (h.ability - 78) * 0.034 +
    styleMod(h.style, progress) * 0.9 +
    h.form * 0.65 +
    Math.sin(simT * 1.31 + h.noiseSeed) * 0.28 +
    Math.sin(simT * 0.43 + h.noiseSeed * 2.7) * 0.22;
  if (progress > 0.74) {
    v += h.spurt * Math.min(1, (progress - 0.74) / 0.13) * (h.ability / 82);
  }
  return v;
}

export function formatTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}
