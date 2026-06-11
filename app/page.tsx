"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bet,
  BET_LABEL,
  BetType,
  formatTime,
  generateRace,
  Horse,
  mulberry32,
  Player,
  placeOdds,
  quinellaOdds,
  styleMod,
  WAKU_COLORS,
  WAKU_TEXT,
} from "./data";

type Phase = "setup" | "betting" | "race" | "result";

const DISTANCES = [1200, 1600, 2000, 2400, 3200];
const START_BALANCE = 10000;

// ---------------------------------------------------------------- メイン
export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [players, setPlayers] = useState<Player[]>([]);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [distance, setDistance] = useState(2000);
  const [race, setRace] = useState<{ horses: Horse[]; title: string } | null>(
    null
  );
  const [bets, setBets] = useState<Bet[]>([]);
  const [order, setOrder] = useState<Horse[]>([]);

  // localStorage 復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem("keiba-royale-players");
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p.length) setPlayers(p);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (players.length)
      localStorage.setItem("keiba-royale-players", JSON.stringify(players));
  }, [players]);

  const newRace = useCallback(
    (s: number, d: number) => {
      setRace(generateRace(s, d));
      setBets([]);
    },
    []
  );

  const startGame = (names: string[], keepBalance: boolean) => {
    setPlayers((prev) =>
      names.map((n) => {
        const old = keepBalance ? prev.find((p) => p.name === n) : undefined;
        return { name: n, balance: old ? old.balance : START_BALANCE };
      })
    );
    newRace(seed, distance);
    setPhase("betting");
  };

  const changeDistance = (d: number) => {
    // ベット済みなら返金してから引き直し
    setPlayers((ps) =>
      ps.map((p, i) => ({
        ...p,
        balance:
          p.balance +
          bets.filter((b) => b.playerIdx === i).reduce((a, b) => a + b.amount, 0),
      }))
    );
    setDistance(d);
    newRace(seed, d);
  };

  const addBet = (bet: Bet) => {
    setPlayers((ps) =>
      ps.map((p, i) =>
        i === bet.playerIdx ? { ...p, balance: p.balance - bet.amount } : p
      )
    );
    setBets((bs) => [...bs, bet]);
  };

  const removeBet = (idx: number) => {
    const bet = bets[idx];
    setPlayers((ps) =>
      ps.map((p, i) =>
        i === bet.playerIdx ? { ...p, balance: p.balance + bet.amount } : p
      )
    );
    setBets((bs) => bs.filter((_, i) => i !== idx));
  };

  const onRaceFinish = (finished: Horse[]) => {
    setOrder(finished);
    // 払い戻し
    setPlayers((ps) => {
      const next = ps.map((p) => ({ ...p }));
      for (const bet of bets) {
        const pay = calcPayout(bet, finished);
        next[bet.playerIdx].balance += pay;
      }
      return next;
    });
    setPhase("result");
  };

  const nextRace = () => {
    const s = Math.floor(Math.random() * 1e9);
    setSeed(s);
    newRace(s, distance);
    setPhase("betting");
  };

  return (
    <main className="wrap">
      <header className="appHeader">
        <h1>
          🏇 KEIBA <span className="gold">ROYALE</span>
        </h1>
        <p className="sub">歴代の名馬で遊ぶベッティングゲーム</p>
      </header>
      {phase === "setup" && (
        <SetupScreen prev={players} onStart={startGame} />
      )}
      {phase === "betting" && race && (
        <BettingScreen
          race={race}
          distance={distance}
          players={players}
          bets={bets}
          onAddBet={addBet}
          onRemoveBet={removeBet}
          onChangeDistance={changeDistance}
          onStart={() => setPhase("race")}
          onBackSetup={() => setPhase("setup")}
        />
      )}
      {phase === "race" && race && (
        <RaceScreen
          race={race}
          distance={distance}
          onFinish={onRaceFinish}
        />
      )}
      {phase === "result" && race && (
        <ResultScreen
          race={race}
          order={order}
          bets={bets}
          players={players}
          onNext={nextRace}
          onSetup={() => setPhase("setup")}
        />
      )}
      <footer className="appFooter">
        ※ 架空のポイントで遊ぶゲームです。実際の金銭の賭博ではありません。
      </footer>
    </main>
  );
}

function calcPayout(bet: Bet, order: Horse[]): number {
  const byNum = (n: number) => order.find((h) => h.num === n)!;
  if (bet.type === "win") {
    if (order[0].num === bet.horses[0])
      return Math.floor(bet.amount * byNum(bet.horses[0]).odds);
    return 0;
  }
  if (bet.type === "place") {
    const top3 = order.slice(0, 3).map((h) => h.num);
    if (top3.includes(bet.horses[0]))
      return Math.floor(bet.amount * placeOdds(byNum(bet.horses[0]).odds));
    return 0;
  }
  // 馬連
  const top2 = order.slice(0, 2).map((h) => h.num).sort().join("-");
  const sel = [...bet.horses].sort().join("-");
  if (top2 === sel)
    return Math.floor(
      bet.amount * quinellaOdds(byNum(bet.horses[0]), byNum(bet.horses[1]))
    );
  return 0;
}

// ---------------------------------------------------------------- セットアップ
function SetupScreen({
  prev,
  onStart,
}: {
  prev: Player[];
  onStart: (names: string[], keep: boolean) => void;
}) {
  const [names, setNames] = useState<string[]>(
    prev.length ? prev.map((p) => p.name) : ["プレイヤー1", "プレイヤー2"]
  );
  return (
    <section className="panel setup">
      <h2>👥 プレイヤー登録</h2>
      <p className="muted">
        参加メンバーを入力してね（1〜6人 / 持ちポイント {START_BALANCE.toLocaleString()}pt スタート）
      </p>
      <div className="nameList">
        {names.map((n, i) => (
          <div key={i} className="nameRow">
            <input
              value={n}
              maxLength={12}
              onChange={(e) =>
                setNames(names.map((x, j) => (j === i ? e.target.value : x)))
              }
            />
            {names.length > 1 && (
              <button
                className="btn small ghost"
                onClick={() => setNames(names.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {names.length < 6 && (
        <button
          className="btn ghost"
          onClick={() => setNames([...names, `プレイヤー${names.length + 1}`])}
        >
          ＋ メンバー追加
        </button>
      )}
      <button
        className="btn primary big"
        disabled={names.some((n) => !n.trim())}
        onClick={() => onStart(names.map((n) => n.trim()), true)}
      >
        競馬場へ入場する 🏟️
      </button>
    </section>
  );
}

// ---------------------------------------------------------------- 馬券売場
function BettingScreen({
  race,
  distance,
  players,
  bets,
  onAddBet,
  onRemoveBet,
  onChangeDistance,
  onStart,
  onBackSetup,
}: {
  race: { horses: Horse[]; title: string };
  distance: number;
  players: Player[];
  bets: Bet[];
  onAddBet: (b: Bet) => void;
  onRemoveBet: (i: number) => void;
  onChangeDistance: (d: number) => void;
  onStart: () => void;
  onBackSetup: () => void;
}) {
  const [playerIdx, setPlayerIdx] = useState(0);
  const [betType, setBetType] = useState<BetType>("win");
  const [sel, setSel] = useState<number[]>([]);
  const [amount, setAmount] = useState(500);

  const need = betType === "quinella" ? 2 : 1;
  const toggleHorse = (n: number) => {
    setSel((s) =>
      s.includes(n) ? s.filter((x) => x !== n) : [...s.slice(-(need - 1)), n]
    );
  };
  useEffect(() => setSel([]), [betType]);

  const popularity = [...race.horses]
    .sort((a, b) => a.odds - b.odds)
    .map((h) => h.num);

  const previewOdds = () => {
    if (sel.length < need) return null;
    const h = race.horses.find((x) => x.num === sel[0])!;
    if (betType === "win") return h.odds;
    if (betType === "place") return placeOdds(h.odds);
    const h2 = race.horses.find((x) => x.num === sel[1])!;
    return quinellaOdds(h, h2);
  };

  const canBet =
    sel.length === need &&
    amount > 0 &&
    players[playerIdx].balance >= amount;

  return (
    <section className="betting">
      <div className="panel raceInfo">
        <h2>{race.title}</h2>
        <div className="distRow">
          <span className="muted">距離変更:</span>
          {DISTANCES.map((d) => (
            <button
              key={d}
              className={`btn small ${d === distance ? "primary" : "ghost"}`}
              onClick={() => onChangeDistance(d)}
            >
              {d}m
            </button>
          ))}
        </div>
        <table className="horseTable">
          <thead>
            <tr>
              <th>馬番</th>
              <th>馬名</th>
              <th>脚質</th>
              <th>単勝</th>
              <th>複勝</th>
              <th>人気</th>
            </tr>
          </thead>
          <tbody>
            {race.horses.map((h) => (
              <tr key={h.num}>
                <td>
                  <span
                    className="waku"
                    style={{
                      background: WAKU_COLORS[h.num - 1],
                      color: WAKU_TEXT[h.num - 1],
                    }}
                  >
                    {h.num}
                  </span>
                </td>
                <td className="horseName">{h.name}</td>
                <td>{h.style}</td>
                <td className="odds">{h.odds.toFixed(1)}</td>
                <td className="muted">{placeOdds(h.odds).toFixed(1)}</td>
                <td>{popularity.indexOf(h.num) + 1}番人気</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel betPanel">
        <h2>🎫 馬券売場</h2>
        <div className="tabRow">
          {players.map((p, i) => (
            <button
              key={i}
              className={`tab ${i === playerIdx ? "active" : ""}`}
              onClick={() => setPlayerIdx(i)}
            >
              {p.name}
              <span className="bal">{p.balance.toLocaleString()}pt</span>
            </button>
          ))}
        </div>
        <div className="betTypeRow">
          {(Object.keys(BET_LABEL) as BetType[]).map((t) => (
            <button
              key={t}
              className={`btn small ${betType === t ? "primary" : "ghost"}`}
              onClick={() => setBetType(t)}
            >
              {BET_LABEL[t]}
            </button>
          ))}
          <span className="muted hint">
            {betType === "win" && "1着を当てる"}
            {betType === "place" && "3着以内に入れば的中"}
            {betType === "quinella" && "1・2着の組み合わせ(2頭選択)"}
          </span>
        </div>
        <div className="horsePick">
          {race.horses.map((h) => (
            <button
              key={h.num}
              className={`pick ${sel.includes(h.num) ? "selected" : ""}`}
              style={{
                borderColor: WAKU_COLORS[h.num - 1],
              }}
              onClick={() => toggleHorse(h.num)}
            >
              <span
                className="waku"
                style={{
                  background: WAKU_COLORS[h.num - 1],
                  color: WAKU_TEXT[h.num - 1],
                }}
              >
                {h.num}
              </span>
              <span className="pickName">{h.name}</span>
            </button>
          ))}
        </div>
        <div className="amountRow">
          <input
            type="number"
            value={amount}
            min={100}
            step={100}
            onChange={(e) => setAmount(Math.max(0, +e.target.value))}
          />
          <span className="muted">pt</span>
          {[100, 500, 1000, 5000].map((a) => (
            <button key={a} className="btn small ghost" onClick={() => setAmount(a)}>
              {a >= 1000 ? `${a / 1000}k` : a}
            </button>
          ))}
        </div>
        {previewOdds() && (
          <p className="preview">
            オッズ <b>{previewOdds()!.toFixed(1)}倍</b> → 的中なら{" "}
            <b className="gold">
              {Math.floor(amount * previewOdds()!).toLocaleString()}pt
            </b>
          </p>
        )}
        <button
          className="btn primary"
          disabled={!canBet}
          onClick={() => {
            onAddBet({ playerIdx, type: betType, horses: [...sel], amount });
            setSel([]);
          }}
        >
          この内容でベットする
        </button>
        {players[playerIdx].balance < amount && (
          <p className="warn">ポイントが足りないよ💦</p>
        )}

        <h3>購入済み馬券 ({bets.length}枚)</h3>
        <ul className="betList">
          {bets.map((b, i) => (
            <li key={i}>
              <span className="betPlayer">{players[b.playerIdx].name}</span>
              <span>{BET_LABEL[b.type]}</span>
              <span>
                {b.horses
                  .map((n) => `${n}.${race.horses.find((h) => h.num === n)!.name}`)
                  .join(" - ")}
              </span>
              <span className="odds">{b.amount.toLocaleString()}pt</span>
              <button className="btn small ghost" onClick={() => onRemoveBet(i)}>
                取消
              </button>
            </li>
          ))}
          {!bets.length && <li className="muted">まだ馬券がないよ〜</li>}
        </ul>
        <div className="startRow">
          <button className="btn ghost" onClick={onBackSetup}>
            メンバー変更
          </button>
          <button className="btn primary big" onClick={onStart}>
            🏇 レース発走！
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- レース
const PXM = 7; // 1m = 7px
const W = 960;
const H = 500;
const SIM_SPEED = 9;

function RaceScreen({
  race,
  distance,
  onFinish,
}: {
  race: { horses: Horse[]; title: string };
  distance: number;
  onFinish: (order: Horse[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    // レース状態(コンポーネント外で管理)
    const horses = race.horses.map((h) => ({ ...h, pos: 0, finishTime: null as number | null }));
    let simT = -3; // 発走前カウントダウン3秒
    let last = performance.now();
    let raf = 0;
    let doneAt: number | null = null;
    let spurtFlash = 0;
    const decoRand = mulberry32(12345);
    const crowd: { x: number; y: number; c: string }[] = [];
    for (let i = 0; i < 700; i++) {
      crowd.push({
        x: decoRand() * 3000,
        y: 38 + decoRand() * 50,
        c: `hsl(${Math.floor(decoRand() * 360)},45%,${55 + decoRand() * 25}%)`,
      });
    }

    const tick = (now: number) => {
      const dtReal = Math.min(0.05, (now - last) / 1000);
      last = now;
      const before = simT;
      simT += dtReal * (simT < 0 ? 1 : SIM_SPEED);

      if (simT >= 0) {
        const dt = simT - Math.max(0, before);
        for (const h of horses) {
          if (h.finishTime !== null) {
            h.pos += 15 * dt; // 流す
            continue;
          }
          const progress = h.pos / distance;
          let v =
            15.9 +
            (h.ability - 78) * 0.052 +
            styleMod(h.style, progress) * 0.9 +
            h.form * 0.32 +
            Math.sin(simT * 1.31 + h.noiseSeed) * 0.22 +
            Math.sin(simT * 0.43 + h.noiseSeed * 2.7) * 0.18;
          if (progress > 0.74) {
            v += h.spurt * Math.min(1, (progress - 0.74) / 0.13) * (h.ability / 82);
          }
          const newPos = h.pos + v * dt;
          if (newPos >= distance && h.finishTime === null) {
            // ゴール通過時刻を線形補間
            h.finishTime = simT - dt + dt * ((distance - h.pos) / (newPos - h.pos));
          }
          h.pos = newPos;
        }
        const remaining = distance - Math.max(...horses.map((h) => h.pos));
        if (remaining <= 400 && remaining > 0 && spurtFlash === 0) spurtFlash = simT;
        if (horses.every((h) => h.finishTime !== null) && doneAt === null) {
          doneAt = simT;
        }
        if (doneAt !== null && simT - doneAt > 9) {
          cancelAnimationFrame(raf);
          const order = [...horses].sort(
            (a, b) => a.finishTime! - b.finishTime!
          );
          onFinishRef.current(order as Horse[]);
          return;
        }
      }

      draw(ctx, horses, simT, distance, race.title, crowd, spurtFlash, doneAt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="panel racePanel">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: "100%", maxWidth: 960, borderRadius: 12 }}
      />
      <p className="muted center">実況: 各馬一斉にスタート！ゴールまで見届けよう🔥</p>
    </section>
  );
}

type SimHorse = Horse & { finishTime: number | null };

function draw(
  ctx: CanvasRenderingContext2D,
  horses: SimHorse[],
  simT: number,
  distance: number,
  title: string,
  crowd: { x: number; y: number; c: string }[],
  spurtFlash: number,
  doneAt: number | null
) {
  const leader = Math.max(...horses.map((h) => h.pos));
  const leaderH = horses.find((h) => h.pos === leader)!;
  let camX = Math.max(-200, leader * PXM - W * 0.62);
  // ゴール後はゴール板にカメラ固定
  camX = Math.min(camX, distance * PXM - W * 0.55 + 150);
  const remaining = Math.max(0, distance - leader);
  // ラストの直線で軽くカメラシェイク
  if (remaining > 0 && remaining < 300) {
    camX += Math.sin(simT * 47) * 2.2;
  }

  // ---- 空
  const sky = ctx.createLinearGradient(0, 0, 0, 180);
  sky.addColorStop(0, "#6fa8dc");
  sky.addColorStop(1, "#cfe3f5");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 180);
  // 雲
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 460 - camX * 0.06) % (W + 300)) - 150;
    const cy = 28 + (i % 3) * 22;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 56, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 34, cy - 8, 36, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- スタンド(パララックス)
  const standPar = 0.25;
  const standW = 3000;
  const sx = -((camX * standPar) % standW);
  for (let r = -1; r <= 1; r++) {
    const ox = sx + r * standW;
    // 建物
    ctx.fillStyle = "#b8bcc4";
    ctx.fillRect(ox, 60, standW - 200, 80);
    ctx.fillStyle = "#9aa0aa";
    ctx.fillRect(ox, 52, standW - 200, 12);
    // 屋根
    ctx.fillStyle = "#e8eaee";
    ctx.beginPath();
    ctx.moveTo(ox - 14, 60);
    ctx.lineTo(ox + standW - 186, 60);
    ctx.lineTo(ox + standW - 220, 38);
    ctx.lineTo(ox + 20, 38);
    ctx.closePath();
    ctx.fill();
    // 観客
    for (const c of crowd) {
      const px = ox + c.x;
      if (px < -10 || px > W + 10) continue;
      ctx.fillStyle = c.c;
      ctx.fillRect(px, c.y + 50, 3, 4);
    }
  }

  // ---- 芝生(刈り模様)
  ctx.fillStyle = "#2c8a4a";
  ctx.fillRect(0, 180, W, H - 180);
  const stripeW = 70;
  for (let x = -((camX % (stripeW * 2)) + stripeW * 2); x < W + stripeW; x += stripeW * 2) {
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fillRect(x, 180, stripeW, H - 180);
  }
  // 奥の芝の色変化
  const turfGrad = ctx.createLinearGradient(0, 180, 0, H);
  turfGrad.addColorStop(0, "rgba(255,255,200,0.10)");
  turfGrad.addColorStop(1, "rgba(0,40,0,0.18)");
  ctx.fillStyle = turfGrad;
  ctx.fillRect(0, 180, W, H - 180);

  // ---- 内ラチ(白柵)
  ctx.fillStyle = "#f4f4f0";
  ctx.fillRect(0, 196, W, 5);
  for (let x = -(camX % 46); x < W; x += 46) {
    ctx.fillRect(x, 186, 4, 15);
  }

  // ---- ハロン棒(残り距離標識)
  ctx.textAlign = "center";
  for (let m = 200; m < distance; m += 200) {
    const x = (distance - m) * PXM - camX;
    if (x < -40 || x > W + 40) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 2, 168, 4, 34);
    ctx.fillStyle = m % 400 === 0 ? "#d33" : "#2a6";
    ctx.beginPath();
    ctx.arc(x, 162, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText(`${m}`, x, 166);
  }

  // ---- スタートゲート
  const gateX = -camX;
  if (gateX > -120 && gateX < W + 60) {
    ctx.fillStyle = "#3c4754";
    ctx.fillRect(gateX - 60, 150, 14, 330);
    ctx.fillStyle = "#5a6b7d";
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(gateX - 54, 208 + i * 33, 50, 4);
    }
  }

  // ---- ゴール板
  const goalX = distance * PXM - camX;
  if (goalX > -80 && goalX < W + 80) {
    ctx.fillStyle = "#222";
    ctx.fillRect(goalX, 130, 6, 350);
    // チェッカー円盤
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? "#111" : "#fff";
      ctx.beginPath();
      ctx.moveTo(goalX + 3, 150);
      ctx.arc(goalX + 3, 150, 22, (i * Math.PI) / 8, ((i + 1) * Math.PI) / 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(goalX - 36, 175, 78, 18);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("GOAL", goalX + 3, 188);
  }

  // ---- 馬たち(奥のレーンから描画)
  const laneTop = 225;
  const laneGap = 31;
  for (const h of horses) {
    const x = h.pos * PXM - camX;
    const y = laneTop + (h.num - 1) * laneGap;
    if (x < -120 || x > W + 120) continue;
    drawHorse(ctx, x, y, h, simT);
  }

  // ---- HUD
  ctx.fillStyle = "rgba(10,14,20,0.72)";
  ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = "#f0d979";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, 12, 20);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "right";
  ctx.fillText(
    remaining > 0 ? `残り ${Math.ceil(remaining)}m` : "ゴール！",
    W - 12,
    20
  );

  // 現在の順位(上位5頭)
  if (simT > 0) {
    const ranking = [...horses].sort((a, b) =>
      a.finishTime !== null && b.finishTime !== null
        ? a.finishTime - b.finishTime
        : b.pos - a.pos
    );
    ctx.textAlign = "left";
    ctx.font = "bold 12px sans-serif";
    for (let i = 0; i < 5; i++) {
      const h = ranking[i];
      const bx = 12,
        by = 44 + i * 24;
      ctx.fillStyle = "rgba(10,14,20,0.6)";
      ctx.fillRect(bx - 4, by - 13, 158, 19);
      ctx.fillStyle = WAKU_COLORS[h.num - 1];
      ctx.fillRect(bx, by - 10, 13, 13);
      ctx.fillStyle = WAKU_TEXT[h.num - 1];
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(`${h.num}`, bx + 3.5, by);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(`${i + 1}. ${h.name}`, bx + 18, by);
    }
  }

  // ---- ミニマップ
  ctx.fillStyle = "rgba(10,14,20,0.6)";
  ctx.fillRect(180, H - 26, W - 360, 16);
  ctx.strokeStyle = "#888";
  ctx.strokeRect(180, H - 26, W - 360, 16);
  for (const h of horses) {
    const mx = 180 + Math.min(1, h.pos / distance) * (W - 360);
    ctx.fillStyle = WAKU_COLORS[h.num - 1];
    ctx.beginPath();
    ctx.arc(mx, H - 18, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#fff";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("S", 168, H - 14);
  ctx.fillText("G", W - 174, H - 14);

  // ---- 演出テキスト
  ctx.textAlign = "center";
  if (simT < 0) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText(`${Math.ceil(-simT)}`, W / 2, H / 2);
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("まもなく発走…ファンファーレ🎺", W / 2, H / 2 + 50);
  } else if (simT < 1.2) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 44px sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 6;
    ctx.strokeText("スタート！", W / 2, 120);
    ctx.fillText("スタート！", W / 2, 120);
  }
  if (spurtFlash > 0 && simT - spurtFlash < 1.6 && remaining > 0) {
    const a = 1 - (simT - spurtFlash) / 1.6;
    ctx.fillStyle = `rgba(255,215,0,${a})`;
    ctx.font = "bold 40px sans-serif";
    ctx.strokeStyle = `rgba(120,40,0,${a})`;
    ctx.lineWidth = 5;
    ctx.strokeText("🔥 最後の直線！ラストスパート！", W / 2, 120);
    ctx.fillText("🔥 最後の直線！ラストスパート！", W / 2, 120);
  }
  if (doneAt !== null) {
    const ranking = [...horses].sort((a, b) => a.finishTime! - b.finishTime!);
    const win = ranking[0];
    const margin = ranking[1].finishTime! - win.finishTime!;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(W / 2 - 280, 60, 560, 92);
    ctx.fillStyle = "#f0d979";
    ctx.font = "bold 30px sans-serif";
    ctx.fillText(
      margin < 0.08 ? "📸 写真判定…！" : "🏆 確定！",
      W / 2,
      96
    );
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(
      `1着 ${win.num}番 ${win.name}  (${formatTime(win.finishTime!)})`,
      W / 2,
      132
    );
  }
}

function drawHorse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: SimHorse,
  simT: number
) {
  const running = simT > 0 && h.finishTime === null;
  const phase = h.pos * 0.42 + h.noiseSeed;
  const bob = running ? Math.sin(phase * 2) * 1.6 : 0;
  const wc = WAKU_COLORS[h.num - 1];

  ctx.save();
  ctx.translate(x, y + bob);

  // 影
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 21 - bob, 30, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- 脚(4本・ギャロップ)
  const legColor = shade(h.coat, -18);
  ctx.strokeStyle = legColor;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const legs = [
    { ox: -16, p: phase },
    { ox: -11, p: phase + 0.9 },
    { ox: 12, p: phase + Math.PI },
    { ox: 17, p: phase + Math.PI + 0.9 },
  ];
  for (const leg of legs) {
    const swing = running ? Math.sin(leg.p) : 0;
    const lift = running ? Math.max(0, Math.cos(leg.p)) : 0;
    const kneeX = leg.ox + swing * 7;
    const kneeY = 11 - lift * 3;
    const hoofX = kneeX + swing * 7;
    const hoofY = 20 - lift * 6;
    ctx.beginPath();
    ctx.moveTo(leg.ox, 4);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(hoofX, hoofY);
    ctx.stroke();
  }

  // ---- 尻尾
  ctx.strokeStyle = shade(h.coat, -30);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-23, -4);
  ctx.quadraticCurveTo(
    -33,
    -2 + (running ? Math.sin(phase) * 3 : 0),
    -35,
    8 + (running ? Math.cos(phase * 1.3) * 3 : 0)
  );
  ctx.stroke();

  // ---- 胴体
  ctx.fillStyle = h.coat;
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // 胸・後躯の膨らみ
  ctx.beginPath();
  ctx.ellipse(16, 1, 9, 8.5, 0, 0, Math.PI * 2);
  ctx.ellipse(-15, -1, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- 首・頭
  ctx.beginPath();
  ctx.moveTo(15, -6);
  ctx.quadraticCurveTo(24, -14, 30, -16);
  ctx.lineTo(34, -10);
  ctx.quadraticCurveTo(26, -4, 20, 2);
  ctx.closePath();
  ctx.fill();
  // 頭部
  ctx.beginPath();
  ctx.ellipse(34, -14, 8, 4.5, -0.35, 0, Math.PI * 2);
  ctx.fill();
  // 耳
  ctx.beginPath();
  ctx.moveTo(30, -18);
  ctx.lineTo(31.5, -23);
  ctx.lineTo(34, -18.5);
  ctx.closePath();
  ctx.fill();
  // たてがみ
  ctx.strokeStyle = shade(h.coat, -35);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(28, -16);
  ctx.quadraticCurveTo(20, -10, 16, -4);
  ctx.stroke();

  // ---- ゼッケン
  ctx.fillStyle = "#fff";
  ctx.fillRect(-8, -8, 14, 12);
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.strokeRect(-8, -8, 14, 12);
  ctx.fillStyle = "#111";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${h.num}`, -1, 2);

  // ---- 騎手
  const jLean = running ? 0.15 + Math.sin(phase * 2) * 0.04 : 0.1;
  ctx.save();
  ctx.translate(-1, -12);
  ctx.rotate(-jLean - 0.5);
  // 胴体(勝負服 = 枠色)
  ctx.fillStyle = wc === "#ffffff" ? "#dcdcdc" : wc;
  ctx.fillRect(-3, -12, 7, 13);
  ctx.restore();
  // ヘルメット
  ctx.fillStyle = wc;
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(5, -23, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 腕→手綱
  ctx.strokeStyle = "#5a4632";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(4, -16);
  ctx.lineTo(16, -10);
  ctx.stroke();
  ctx.strokeStyle = "rgba(60,40,20,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, -10);
  ctx.lineTo(31, -13);
  ctx.stroke();

  ctx.restore();
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------- 結果
function ResultScreen({
  race,
  order,
  bets,
  players,
  onNext,
  onSetup,
}: {
  race: { horses: Horse[]; title: string };
  order: Horse[];
  bets: Bet[];
  players: Player[];
  onNext: () => void;
  onSetup: () => void;
}) {
  const popularity = [...race.horses]
    .sort((a, b) => a.odds - b.odds)
    .map((h) => h.num);

  return (
    <section className="betting">
      <div className="panel">
        <h2>🏁 レース結果 — {race.title}</h2>
        <table className="horseTable">
          <thead>
            <tr>
              <th>着順</th>
              <th>馬番</th>
              <th>馬名</th>
              <th>タイム</th>
              <th>人気</th>
            </tr>
          </thead>
          <tbody>
            {order.map((h, i) => (
              <tr key={h.num} className={i === 0 ? "winner" : ""}>
                <td>{i + 1}着</td>
                <td>
                  <span
                    className="waku"
                    style={{
                      background: WAKU_COLORS[h.num - 1],
                      color: WAKU_TEXT[h.num - 1],
                    }}
                  >
                    {h.num}
                  </span>
                </td>
                <td className="horseName">
                  {h.name}
                  {i === 0 && " 🏆"}
                </td>
                <td>{formatTime(h.finishTime!)}</td>
                <td>{popularity.indexOf(h.num) + 1}番人気</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>払戻金</h3>
        <ul className="payoutList">
          <li>
            単勝 {order[0].num} — <b>{(order[0].odds * 100).toFixed(0)}円相当</b>{" "}
            ({order[0].odds.toFixed(1)}倍)
          </li>
          <li>
            複勝 {order.slice(0, 3).map((h) => h.num).join(", ")} — 各
            {order
              .slice(0, 3)
              .map((h) => ` ${placeOdds(h.odds).toFixed(1)}倍`)
              .join(" /")}
          </li>
          <li>
            馬連 {[order[0].num, order[1].num].sort((a, b) => a - b).join("-")} —{" "}
            <b>{quinellaOdds(order[0], order[1]).toFixed(1)}倍</b>
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>💰 みんなの収支</h2>
        {players.map((p, pi) => {
          const myBets = bets.filter((b) => b.playerIdx === pi);
          return (
            <div key={pi} className="playerResult">
              <h3>
                {p.name}{" "}
                <span className="gold">{p.balance.toLocaleString()}pt</span>
              </h3>
              <ul className="betList">
                {myBets.map((b, i) => {
                  const pay = calcPayout(b, order);
                  return (
                    <li key={i} className={pay > 0 ? "hit" : "miss"}>
                      <span>{pay > 0 ? "🎯 的中" : "💨 はずれ"}</span>
                      <span>{BET_LABEL[b.type]}</span>
                      <span>{b.horses.join("-")}</span>
                      <span>{b.amount.toLocaleString()}pt</span>
                      <span className="odds">
                        {pay > 0 ? `+${pay.toLocaleString()}pt` : "±0"}
                      </span>
                    </li>
                  );
                })}
                {!myBets.length && <li className="muted">ノーベットだったよ</li>}
              </ul>
            </div>
          );
        })}
        <div className="startRow">
          <button className="btn ghost" onClick={onSetup}>
            メンバー変更
          </button>
          <button className="btn primary big" onClick={onNext}>
            次のレースへ 🐎
          </button>
        </div>
      </div>
    </section>
  );
}
