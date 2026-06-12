"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bet,
  BET_LABEL,
  BetType,
  formatTime,
  generateRace,
  Horse,
  horseSpeed,
  mulberry32,
  Player,
  placeOdds,
  quinellaOdds,
  RaceInfo,
  WAKU_COLORS,
  WAKU_TEXT,
} from "./data";
import { RaceAudio } from "./audio";

type Phase = "setup" | "betting" | "race" | "result";

const DISTANCES = [1200, 1600, 2000, 2400, 3200];
const START_BALANCE = 10000;
const PLAYER_COLORS = [
  "#e0a437",
  "#5b8def",
  "#e06363",
  "#52b788",
  "#b07fe0",
  "#e08fc0",
];
const STYLE_CLASS: Record<string, string> = {
  逃げ: "nige",
  先行: "senko",
  差し: "sashi",
  追込: "oikomi",
};

// ---------------------------------------------------------------- メイン
export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [players, setPlayers] = useState<Player[]>([]);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [distance, setDistance] = useState(2000);
  const [race, setRace] = useState<RaceInfo | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [order, setOrder] = useState<Horse[]>([]);

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

  const newRace = useCallback((s: number, d: number) => {
    setRace(generateRace(s, d));
    setBets([]);
  }, []);

  const startGame = (names: string[]) => {
    setPlayers((prev) =>
      names.map((n) => {
        const old = prev.find((p) => p.name === n);
        return { name: n, balance: old ? old.balance : START_BALANCE };
      })
    );
    newRace(seed, distance);
    setPhase("betting");
  };

  const changeDistance = (d: number) => {
    setPlayers((ps) =>
      ps.map((p, i) => ({
        ...p,
        balance:
          p.balance +
          bets
            .filter((b) => b.playerIdx === i)
            .reduce((a, b) => a + b.amount, 0),
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
    setPlayers((ps) => {
      const next = ps.map((p) => ({ ...p }));
      for (const bet of bets) {
        next[bet.playerIdx].balance += calcPayout(bet, finished);
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
      {phase === "setup" && <SetupScreen prev={players} onStart={startGame} />}
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
        <RaceScreen race={race} distance={distance} onFinish={onRaceFinish} />
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
  const top2 = order
    .slice(0, 2)
    .map((h) => h.num)
    .sort()
    .join("-");
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
  onStart: (names: string[]) => void;
}) {
  const [names, setNames] = useState<string[]>(
    prev.length ? prev.map((p) => p.name) : ["プレイヤー1", "プレイヤー2"]
  );
  return (
    <section className="panel setup">
      <h2>👥 プレイヤー登録</h2>
      <p className="muted">
        参加メンバーを入力してね（1〜6人 / 持ちポイント{" "}
        {START_BALANCE.toLocaleString()}pt スタート）
      </p>
      <div className="nameList">
        {names.map((n, i) => (
          <div key={i} className="nameRow">
            <span
              className="pAvatar"
              style={{ background: PLAYER_COLORS[i % 6] }}
            >
              {n.trim().slice(0, 1) || "?"}
            </span>
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
        onClick={() => onStart(names.map((n) => n.trim()))}
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
  race: RaceInfo;
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
  useEffect(() => setSel([]), [betType]);

  const toggleHorse = (n: number) =>
    setSel((s) =>
      s.includes(n) ? s.filter((x) => x !== n) : [...s.slice(-(need - 1)), n]
    );

  const popularity = [...race.horses]
    .sort((a, b) => a.odds - b.odds)
    .map((h) => h.num);
  const maxProb = Math.max(...race.horses.map((h) => h.prob));
  const byNum = (n: number) => race.horses.find((h) => h.num === n)!;

  const previewOdds = (): number | null => {
    if (sel.length < need) return null;
    const h = byNum(sel[0]);
    if (betType === "win") return h.odds;
    if (betType === "place") return placeOdds(h.odds);
    return quinellaOdds(h, byNum(sel[1]));
  };
  const odds = previewOdds();
  const player = players[playerIdx];
  const canBet = sel.length === need && amount >= 100 && player.balance >= amount;
  const gradeClass =
    race.grade === "G I" ? "g1" : race.grade === "G II" ? "g2" : "g3";

  return (
    <section className="betting2">
      {/* レースバナー */}
      <div className="raceBanner">
        <div className="raceBannerMain">
          <span className={`gradeBadge ${gradeClass}`}>{race.grade}</span>
          <div>
            <h2>
              第{race.raceNo}R {race.raceName}
            </h2>
            <p className="raceMeta">
              芝{distance}m・良 ☀️ 晴 ／ 8頭立て ／ 発走間近
            </p>
          </div>
        </div>
        <div className="distRow">
          {DISTANCES.map((d) => (
            <button
              key={d}
              className={`distBtn ${d === distance ? "on" : ""}`}
              onClick={() => onChangeDistance(d)}
            >
              {d}m
            </button>
          ))}
        </div>
      </div>

      {/* 出馬表 */}
      <div className="panel umaPanel">
        <div className="panelHead">
          <h3>📋 出馬表</h3>
          <span className="muted">馬をタップして馬券に追加</span>
        </div>
        <div className="umaList">
          {race.horses.map((h) => {
            const rank = popularity.indexOf(h.num) + 1;
            const selIdx = sel.indexOf(h.num);
            return (
              <button
                key={h.num}
                className={`horseRow ${selIdx >= 0 ? "sel" : ""}`}
                onClick={() => toggleHorse(h.num)}
              >
                <span
                  className="waku big"
                  style={{
                    background: WAKU_COLORS[h.num - 1],
                    color: WAKU_TEXT[h.num - 1],
                  }}
                >
                  {h.num}
                </span>
                <span className="hInfo">
                  <span className="hName">{h.name}</span>
                  <span className="hSub">
                    <i className={`styleBadge s-${STYLE_CLASS[h.style]}`}>
                      {h.style}
                    </i>
                    <span className="probBar">
                      <i style={{ width: `${(h.prob / maxProb) * 100}%` }} />
                    </span>
                  </span>
                </span>
                <span className="hOdds">
                  <b
                    className={
                      h.odds < 5 ? "hot" : h.odds < 20 ? "mid" : "cold"
                    }
                  >
                    {h.odds.toFixed(1)}
                  </b>
                  <small>倍</small>
                </span>
                <span className={`popBadge p${rank <= 3 ? rank : "x"}`}>
                  {rank}人気
                </span>
                {selIdx >= 0 && (
                  <span className="selMark">
                    {need === 2 ? (selIdx === 0 ? "1頭目" : "2頭目") : "✓ 選択中"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rightCol">
        {/* 馬券購入 */}
        <div className="panel buyPanel">
          <div className="panelHead">
            <h3>🎫 馬券を買う</h3>
          </div>

          <div className="pTabs">
            {players.map((p, i) => (
              <button
                key={i}
                className={`pTab ${i === playerIdx ? "active" : ""}`}
                onClick={() => setPlayerIdx(i)}
              >
                <span
                  className="pAvatar"
                  style={{ background: PLAYER_COLORS[i % 6] }}
                >
                  {p.name.slice(0, 1)}
                </span>
                <span className="pTabInfo">
                  <b>{p.name}</b>
                  <small>{p.balance.toLocaleString()}pt</small>
                </span>
              </button>
            ))}
          </div>

          <p className="stepLabel">
            <b>①</b> 式別をえらぶ
          </p>
          <div className="typeRow">
            {(Object.keys(BET_LABEL) as BetType[]).map((t) => (
              <button
                key={t}
                className={`typeBtn ${betType === t ? "on" : ""}`}
                onClick={() => setBetType(t)}
              >
                <b>{BET_LABEL[t]}</b>
                <small>
                  {t === "win" && "1着を当てる"}
                  {t === "place" && "3着以内でOK"}
                  {t === "quinella" && "1・2着の組合せ"}
                </small>
              </button>
            ))}
          </div>

          <p className="stepLabel">
            <b>②</b> 馬をえらぶ{" "}
            <span className="muted">
              （出馬表をタップ{need === 2 ? "・2頭" : ""}）
            </span>
          </p>
          <div className="selChips">
            {sel.length === 0 && (
              <span className="muted">← 出馬表から選んでね</span>
            )}
            {sel.map((n) => (
              <span key={n} className="selChip">
                <span
                  className="waku"
                  style={{
                    background: WAKU_COLORS[n - 1],
                    color: WAKU_TEXT[n - 1],
                  }}
                >
                  {n}
                </span>
                {byNum(n).name}
                <button onClick={() => toggleHorse(n)}>✕</button>
              </span>
            ))}
          </div>

          <p className="stepLabel">
            <b>③</b> 金額をきめる
          </p>
          <div className="amountBox">
            <div className="amountDisp">
              <input
                type="number"
                value={amount || ""}
                min={100}
                step={100}
                onChange={(e) =>
                  setAmount(Math.max(0, Math.floor(+e.target.value)))
                }
              />
              <span>pt</span>
            </div>
            <div className="amountChips">
              {[100, 500, 1000, 5000].map((a) => (
                <button key={a} onClick={() => setAmount((x) => x + a)}>
                  +{a >= 1000 ? `${a / 1000}k` : a}
                </button>
              ))}
              <button className="clear" onClick={() => setAmount(0)}>
                C
              </button>
            </div>
          </div>

          {/* 馬券プレビュー */}
          {sel.length === need && odds ? (
            <div className={`ticket t-${betType}`}>
              <div className="ticketHead">
                <span>KEIBA ROYALE</span>
                <span>
                  第{race.raceNo}R {race.raceName}
                </span>
              </div>
              <div className="ticketBody">
                <span className="ticketType">{BET_LABEL[betType]}</span>
                <span className="ticketHorses">
                  {sel.map((n) => (
                    <span key={n}>
                      <b>{n}</b> {byNum(n).name}
                    </span>
                  ))}
                </span>
                <span className="ticketAmount">
                  {amount.toLocaleString()}
                  <small>pt</small>
                </span>
              </div>
              <div className="ticketFoot">
                <span>
                  オッズ <b>{odds.toFixed(1)}倍</b>
                </span>
                <span>
                  的中なら{" "}
                  <b className="payGold">
                    {Math.floor(amount * odds).toLocaleString()}pt
                  </b>
                </span>
              </div>
              <div className="barcode" />
            </div>
          ) : (
            <div className="ticketEmpty">
              式別と馬{need === 2 ? "2頭" : ""}を選ぶと馬券プレビューが出るよ
            </div>
          )}

          <button
            className="btn primary big buyBtn"
            disabled={!canBet}
            onClick={() => {
              onAddBet({ playerIdx, type: betType, horses: [...sel], amount });
              setSel([]);
            }}
          >
            🎫 {player.name} がこの馬券を購入
          </button>
          {player.balance < amount && (
            <p className="warn">ポイントが足りないよ💦</p>
          )}
        </div>

        {/* 購入済み */}
        <div className="panel slipPanel">
          <div className="panelHead">
            <h3>🧾 購入済み馬券（{bets.length}枚）</h3>
          </div>
          <ul className="slipList">
            {bets.map((b, i) => (
              <li key={i} className={`slip t-${b.type}`}>
                <span
                  className="pAvatar sm"
                  style={{ background: PLAYER_COLORS[b.playerIdx % 6] }}
                  title={players[b.playerIdx].name}
                >
                  {players[b.playerIdx].name.slice(0, 1)}
                </span>
                <span className="slipType">{BET_LABEL[b.type]}</span>
                <span className="slipHorses">
                  {b.horses.map((n) => `${n} ${byNum(n).name}`).join(" − ")}
                </span>
                <span className="slipAmt">{b.amount.toLocaleString()}pt</span>
                <button className="slipDel" onClick={() => onRemoveBet(i)}>
                  ✕
                </button>
              </li>
            ))}
            {!bets.length && (
              <li className="muted slipNone">まだ馬券がないよ〜</li>
            )}
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
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- レース描画
const PXM = 7;
const W = 960;
const H = 540;
const SIM_SPEED = 9;
const TW = Math.PI * 2;

const laneD = (num: number) => (num - 1) / 7;
const laneGroundY = (num: number) => {
  const d = laneD(num);
  return 268 + 152 * d + 14 * d * d;
};
const laneScale = (num: number) => 0.62 + 0.46 * laneD(num);

type SimHorse = Horse & { finishTime: number | null };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
  s: number;
};

function RaceScreen({
  race,
  distance,
  onFinish,
}: {
  race: RaceInfo;
  distance: number;
  onFinish: (order: Horse[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const audioRef = useRef<RaceAudio | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(localStorage.getItem("kr-muted") === "1");
  }, []);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem("kr-muted", next ? "1" : "0");
      audioRef.current?.setMuted(next);
      return next;
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const audio = new RaceAudio(localStorage.getItem("kr-muted") === "1");
    audioRef.current = audio;
    audio.fanfare();
    const horses: SimHorse[] = race.horses.map((h) => ({
      ...h,
      pos: 0,
      finishTime: null,
    }));
    let simT = -3.6;
    let last = performance.now();
    let raf = 0;
    let doneAt: number | null = null;
    let spurtT = 0;
    let flashT = 0; // 1着ゴールの瞬間
    let cam = -260;
    let zoom = 1;
    const parts: Particle[] = [];
    const confetti: Particle[] = [];
    const stand = buildStand();
    const adWall = buildAdWall();

    const tick = (now: number) => {
      const dtReal = Math.min(0.05, (now - last) / 1000);
      last = now;
      const before = simT;
      simT += dtReal * (simT < 0 ? 1 : SIM_SPEED);
      if (before < 0 && simT >= 0) audio.startRace();

      if (simT >= 0) {
        const dt = simT - Math.max(0, before);
        const hadFlash = flashT > 0;
        const hadSpurt = spurtT > 0;
        for (const h of horses) {
          if (h.finishTime !== null) {
            h.pos += 14 * dt;
            continue;
          }
          const progress = h.pos / distance;
          const v = horseSpeed(h, progress, simT);
          const newPos = h.pos + v * dt;
          if (newPos >= distance) {
            h.finishTime =
              simT - dt + dt * ((distance - h.pos) / (newPos - h.pos));
            if (flashT === 0) flashT = simT;
          }
          h.pos = newPos;
          // 芝の蹴り上げ
          if (Math.random() < 0.45) {
            parts.push({
              x: h.pos * PXM - 24 * laneScale(h.num) + Math.random() * 20,
              y: laneGroundY(h.num) - Math.random() * 3,
              vx: -90 - Math.random() * 110,
              vy: -30 - Math.random() * 55,
              life: 0.5 + Math.random() * 0.3,
              c: Math.random() < 0.6 ? "#2f6e3c" : "#6e5230",
              s: (1 + Math.random() * 1.6) * laneScale(h.num),
            });
          }
        }
        const leaderPos = Math.max(...horses.map((h) => h.pos));
        const remaining = distance - leaderPos;
        if (remaining <= 420 && remaining > 0 && spurtT === 0) spurtT = simT;
        if (!hadSpurt && spurtT > 0) audio.finalStretch();
        if (!hadFlash && flashT > 0) audio.goal();
        if (horses.every((h) => h.finishTime !== null) && doneAt === null) {
          doneAt = simT;
        }
        if (doneAt !== null && simT - doneAt > 30) {
          cancelAnimationFrame(raf);
          audio.dispose();
          onFinishRef.current(
            [...horses].sort((a, b) => a.finishTime! - b.finishTime!)
          );
          return;
        }
        // 紙吹雪
        if (flashT > 0 && simT - flashT < 5 && Math.random() < 0.8) {
          for (let i = 0; i < 4; i++) {
            confetti.push({
              x: cam + Math.random() * W,
              y: 40 + Math.random() * 120,
              vx: -20 + Math.random() * 40,
              vy: 30 + Math.random() * 50,
              life: 2 + Math.random() * 2,
              c: `hsl(${Math.floor(Math.random() * 360)},85%,65%)`,
              s: 2 + Math.random() * 2.5,
            });
          }
        }
      }

      // パーティクル更新(実時間)
      for (const arr of [parts, confetti]) {
        for (let i = arr.length - 1; i >= 0; i--) {
          const p = arr[i];
          p.life -= dtReal * 1.6;
          p.x += p.vx * dtReal;
          p.y += p.vy * dtReal;
          p.vy += (arr === parts ? 320 : 14) * dtReal;
          if (p.life <= 0) arr.splice(i, 1);
        }
      }
      if (parts.length > 260) parts.splice(0, parts.length - 260);

      // カメラ & ズーム
      const leaderPos = Math.max(...horses.map((h) => h.pos));
      const remaining = Math.max(0, distance - leaderPos);
      let target = Math.max(-260, leaderPos * PXM - W * 0.6);
      target = Math.min(target, distance * PXM - W * 0.52 + 170);
      cam += (target - cam) * Math.min(1, dtReal * 5.5);
      const zTarget =
        doneAt !== null
          ? 1.0
          : remaining < 500
            ? 1 + 0.13 * (1 - remaining / 500)
            : 1;
      zoom += (zTarget - zoom) * Math.min(1, dtReal * 2.2);

      frame(
        ctx,
        horses,
        simT,
        distance,
        race,
        cam,
        zoom,
        stand,
        adWall,
        parts,
        confetti,
        spurtT,
        flashT,
        doneAt
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      audio.dispose();
    };
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
      <button
        className="muteBtn"
        onClick={toggleMute}
        title={muted ? "BGMをオンにする" : "BGMをミュート"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </section>
  );
}

// スタンド(事前描画)
function buildStand(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1500;
  c.height = 178;
  const g = c.getContext("2d")!;
  const rnd = mulberry32(424242);
  // 屋根
  const roof = g.createLinearGradient(0, 0, 0, 38);
  roof.addColorStop(0, "#f2f4f8");
  roof.addColorStop(1, "#c4cad4");
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(-20, 40);
  g.quadraticCurveTo(750, -14, 1520, 40);
  g.lineTo(1520, 18);
  g.quadraticCurveTo(750, -32, -20, 18);
  g.closePath();
  g.fill();
  // 客席(内部)
  const inner = g.createLinearGradient(0, 38, 0, 150);
  inner.addColorStop(0, "#1f242e");
  inner.addColorStop(1, "#3a4150");
  g.fillStyle = inner;
  g.fillRect(0, 38, 1500, 112);
  // 段差ライン
  g.strokeStyle = "rgba(255,255,255,0.08)";
  for (let y = 56; y < 150; y += 18) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(1500, y);
    g.stroke();
  }
  // 観客
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `hsl(${Math.floor(rnd() * 360)},${35 + rnd() * 35}%,${50 + rnd() * 30}%)`;
    g.fillRect(rnd() * 1500, 46 + rnd() * 100, 2.6, 3.6);
  }
  // 柱
  g.fillStyle = "#8a93a3";
  for (let x = 60; x < 1500; x += 240) {
    g.fillRect(x, 30, 7, 122);
  }
  // 前面壁
  const wall = g.createLinearGradient(0, 150, 0, 178);
  wall.addColorStop(0, "#d6dae2");
  wall.addColorStop(1, "#aab1bd");
  g.fillStyle = wall;
  g.fillRect(0, 150, 1500, 28);
  g.fillStyle = "#7e8694";
  for (let x = 0; x < 1500; x += 120) g.fillRect(x, 150, 2, 28);
  return c;
}

// 広告壁(事前描画)
function buildAdWall(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 26;
  const g = c.getContext("2d")!;
  g.fillStyle = "#14532d";
  g.fillRect(0, 0, 900, 26);
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.font = "bold 15px sans-serif";
  g.textAlign = "center";
  const ads = ["KEIBA ROYALE", "★ STAR DERBY ★", "TURF VISION", "GO! GO! UMA"];
  ads.forEach((t, i) => g.fillText(t, 112 + i * 225, 18));
  g.fillStyle = "rgba(255,255,255,0.25)";
  for (let x = 0; x < 900; x += 225) g.fillRect(x, 2, 2, 22);
  return c;
}

function frame(
  ctx: CanvasRenderingContext2D,
  horses: SimHorse[],
  simT: number,
  distance: number,
  race: RaceInfo,
  cam: number,
  zoom: number,
  stand: HTMLCanvasElement,
  adWall: HTMLCanvasElement,
  parts: Particle[],
  confetti: Particle[],
  spurtT: number,
  flashT: number,
  doneAt: number | null
) {
  const ranking = [...horses].sort((a, b) =>
    a.finishTime !== null || b.finishTime !== null
      ? (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity) ||
        b.pos - a.pos
      : b.pos - a.pos
  );
  const leaderH = ranking[0];
  const leaderPos = Math.max(...horses.map((h) => h.pos));
  const remaining = Math.max(0, distance - leaderPos);

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  // 最終直線ズーム
  ctx.translate(W * 0.62, H * 0.52);
  ctx.scale(zoom, zoom);
  ctx.translate(-W * 0.62, -H * 0.52);
  // カメラシェイク
  let shake = 0;
  if (remaining > 0 && remaining < 280) shake = Math.sin(simT * 46) * 2;
  ctx.translate(shake, 0);

  // ---- 空
  const sky = ctx.createLinearGradient(0, 0, 0, 214);
  sky.addColorStop(0, "#6ea7dd");
  sky.addColorStop(1, "#dcebf8");
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, W + 40, 240);
  // 太陽光
  const sun = ctx.createRadialGradient(W - 140, 10, 10, W - 140, 10, 220);
  sun.addColorStop(0, "rgba(255,250,220,0.8)");
  sun.addColorStop(1, "rgba(255,250,220,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(W - 380, -20, 400, 240);
  // 雲
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  for (let i = 0; i < 4; i++) {
    const cx = ((i * 420 - cam * 0.05) % (W + 360)) - 180;
    const cy = 16 + (i % 3) * 14;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60, 11, 0, 0, TW);
    ctx.ellipse(cx + 38, cy - 7, 38, 9, 0, 0, TW);
    ctx.fill();
  }

  // ---- スタンド(パララックス 0.22)
  const sw = stand.width;
  const sx = -(((cam * 0.22) % sw) + sw) % sw;
  ctx.drawImage(stand, sx, 36);
  ctx.drawImage(stand, sx + sw, 36);
  if (sx + sw * 2 < W) ctx.drawImage(stand, sx + sw * 2, 36);
  // 歓声フリッカー(最終直線&ゴール後)
  if ((remaining < 450 && simT > 0) || flashT > 0) {
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `hsla(${Math.floor(Math.random() * 360)},90%,75%,0.9)`;
      ctx.fillRect(Math.random() * W, 82 + Math.random() * 96, 2.6, 3.6);
    }
  }

  // ---- 広告壁(パララックス 0.55)
  const aw = adWall.width;
  const ax = -(((cam * 0.55) % aw) + aw) % aw;
  for (let x = ax; x < W; x += aw) ctx.drawImage(adWall, x, 214);

  // ---- 奥の芝エプロン
  ctx.fillStyle = "#1d6437";
  ctx.fillRect(-20, 240, W + 40, 14);

  // ---- ターフ(横向き刈り分けバンド)
  const bands = [16, 20, 24, 28, 33, 38, 44, 50, 58, 70];
  let by = 254;
  let bi = 0;
  for (const bh of bands) {
    ctx.fillStyle = bi % 2 ? "#2f8c4e" : "#278145";
    ctx.fillRect(-20, by, W + 40, bh);
    by += bh;
    bi++;
  }
  if (by < H + 20) {
    ctx.fillStyle = bi % 2 ? "#2f8c4e" : "#278145";
    ctx.fillRect(-20, by, W + 40, H + 20 - by);
  }
  // 薄い縦のスピード筋
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let x = -((cam % 140) + 140); x < W + 60; x += 140) {
    ctx.beginPath();
    ctx.moveTo(x, 254);
    ctx.lineTo(x + 26, H);
    ctx.lineTo(x + 50, H);
    ctx.lineTo(x + 18, 254);
    ctx.closePath();
    ctx.fill();
  }

  // ---- 内ラチ(白柵)
  ctx.fillStyle = "#f5f5f0";
  ctx.fillRect(-20, 247, W + 40, 4.5);
  ctx.fillStyle = "#e3e3da";
  for (let x = -(((cam % 38) + 38) % 38); x < W; x += 38) {
    ctx.fillRect(x, 240, 3, 12);
  }

  // ---- ハロン棒
  ctx.textAlign = "center";
  for (let m = 200; m < distance; m += 200) {
    const x = (distance - m) * PXM - cam;
    if (x < -40 || x > W + 40) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 1.5, 222, 3, 28);
    ctx.fillStyle = m % 400 === 0 ? "#d33545" : "#2a9d5c";
    ctx.beginPath();
    ctx.arc(x, 216, 11, 0, TW);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px sans-serif";
    ctx.fillText(`${m}`, x, 219.5);
  }

  // ---- スタートゲート(遠景)
  const gateX = -cam;
  if (gateX > -160 && gateX < W + 80) {
    ctx.fillStyle = "#37414d";
    ctx.fillRect(gateX - 86, 206, 80, 46);
    ctx.fillStyle = "#222a33";
    for (let i = 0; i < 8; i++) ctx.fillRect(gateX - 82 + i * 10, 210, 7, 40);
    ctx.fillStyle = "#4d5a68";
    ctx.fillRect(gateX - 90, 200, 88, 8);
  }

  // ---- ゴール
  const gx = distance * PXM - cam;
  if (gx > -120 && gx < W + 120) {
    // ゴールライン(白・少し斜めで奥行き)
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(gx, 252);
    ctx.lineTo(gx + 16, H);
    ctx.stroke();
    // ゴール板(遠側)
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(gx - 2, 168, 5, 84);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? "#111" : "#fff";
      ctx.beginPath();
      ctx.moveTo(gx + 0.5, 184);
      ctx.arc(gx + 0.5, 184, 17, (i * Math.PI) / 8, ((i + 1) * Math.PI) / 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(gx - 32, 204, 66, 15);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("GOAL", gx + 1, 215.5);
  }

  // ---- 芝の蹴り上げ
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - cam, p.y, p.s, p.s);
  }
  ctx.globalAlpha = 1;

  // ---- 馬(奥レーンから手前へ)
  const spurting = spurtT > 0 && remaining > 0;
  for (const h of horses) {
    const sc = laneScale(h.num);
    const x = h.pos * PXM - cam;
    if (x < -140 || x > W + 140) continue;
    const y = laneGroundY(h.num) - 27 * sc;
    // スピードライン
    if (spurting && h.finishTime === null) {
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 38 * sc, y + i * 9 * sc);
        ctx.lineTo(x - (66 + Math.random() * 18) * sc, y + i * 9 * sc);
        ctx.stroke();
      }
    }
    drawHorse(ctx, x, y, h, simT, sc, spurting);
  }

  // ---- 手前を流れる柵ポール(スピード感)
  ctx.fillStyle = "rgba(244,244,238,0.3)";
  for (let x = -(((cam * 1.22) % 430) + 430) % 430; x < W + 30; x += 430) {
    ctx.fillRect(x, H - 90, 9, 90);
    ctx.fillStyle = "rgba(244,244,238,0.16)";
    ctx.fillRect(x - 7, H - 90, 23, 90);
    ctx.fillStyle = "rgba(244,244,238,0.3)";
  }

  // ---- 紙吹雪
  for (const p of confetti) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - cam, p.y, p.s, p.s * 0.7);
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // ズーム解除

  // ---- 写真判定フラッシュ
  if (flashT > 0 && simT - flashT < 0.45) {
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - (simT - flashT) / 0.45)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ================= HUD =================
  // 上部バー
  const bar = ctx.createLinearGradient(0, 0, 0, 34);
  bar.addColorStop(0, "rgba(8,12,18,0.92)");
  bar.addColorStop(1, "rgba(8,12,18,0.65)");
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 34);
  ctx.fillStyle = "#f0d979";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(race.title, 12, 22);
  ctx.textAlign = "right";
  if (remaining > 0) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(`残り ${Math.ceil(remaining)}m`, W - 12, 23);
  } else {
    ctx.fillStyle = "#ffd34d";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("GOAL!", W - 12, 23);
  }

  // ライブ順位(左)
  if (simT > 0.5) {
    ctx.textAlign = "left";
    for (let i = 0; i < 5; i++) {
      const h = ranking[i];
      const bx = 10,
        byy = 52 + i * 25;
      ctx.fillStyle = "rgba(8,12,18,0.66)";
      roundRect(ctx, bx - 4, byy - 14, 168, 21, 5);
      ctx.fill();
      ctx.fillStyle = WAKU_COLORS[h.num - 1];
      roundRect(ctx, bx, byy - 11, 15, 15, 3);
      ctx.fill();
      ctx.fillStyle = WAKU_TEXT[h.num - 1];
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(`${h.num}`, bx + 4, byy + 1);
      ctx.fillStyle = i === 0 ? "#ffd34d" : "#fff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`${i + 1} ${h.name}`, bx + 21, byy + 1);
    }
  }

  // 実況テロップ
  if (simT > 0) {
    const p = leaderPos / distance;
    let live = "";
    if (doneAt !== null || remaining <= 0) {
      live = `ゴールイン！ 勝ったのは ${ranking[0].num}番 ${ranking[0].name}！`;
    } else if (p < 0.08) {
      live = "ゲートが開いた！各馬一斉にスタート！";
    } else if (p < 0.45) {
      live = `先頭は ${leaderH.name}！ ${ranking[1].name} が続く展開！`;
    } else if (p < 0.74) {
      live = `中盤の攻防！ ${leaderH.name} がリードを守る！`;
    } else {
      const closer = ranking
        .slice(1, 5)
        .find((x) => x.style === "差し" || x.style === "追込");
      live = closer
        ? `最後の直線！ ${leaderH.name} が粘る！ ${closer.name} が大外から一気に伸びてくる！`
        : `最後の直線！ ${leaderH.name} が粘る！ ${ranking[1].name} が迫る！`;
    }
    const lg = ctx.createLinearGradient(0, H - 64, 0, H - 34);
    lg.addColorStop(0, "rgba(8,12,18,0)");
    lg.addColorStop(1, "rgba(8,12,18,0.85)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, H - 64, W, 30);
    ctx.fillStyle = "rgba(8,12,18,0.85)";
    ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`🎙 ${live}`, 14, H - 12);
  }

  // ミニマップ(右下)
  const mmX = W - 270,
    mmW = 250,
    mmY = H - 22;
  ctx.fillStyle = "rgba(8,12,18,0.7)";
  roundRect(ctx, mmX - 8, mmY - 9, mmW + 26, 18, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mmX, mmY);
  ctx.lineTo(mmX + mmW, mmY);
  ctx.stroke();
  for (const h of horses) {
    const mx = mmX + Math.min(1, h.pos / distance) * mmW;
    ctx.fillStyle = WAKU_COLORS[h.num - 1];
    ctx.beginPath();
    ctx.arc(mx, mmY, 3.4, 0, TW);
    ctx.fill();
  }
  ctx.fillStyle = "#aaa";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("G", mmX + mmW + 12, mmY + 3);

  // ---- 発走前: 出走表オーバーレイ
  if (simT < 0) {
    ctx.fillStyle = "rgba(5,8,14,0.78)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f0d979";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(race.title, W / 2, 70);
    ctx.fillStyle = "#ccc";
    ctx.font = "13px sans-serif";
    ctx.fillText("― 出走馬 ―", W / 2, 100);
    ctx.textAlign = "left";
    horses.forEach((h, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = W / 2 - 330 + col * 350;
      const y = 136 + row * 44;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRect(ctx, x, y - 22, 320, 34, 7);
      ctx.fill();
      ctx.fillStyle = WAKU_COLORS[h.num - 1];
      roundRect(ctx, x + 8, y - 15, 20, 20, 4);
      ctx.fill();
      ctx.fillStyle = WAKU_TEXT[h.num - 1];
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`${h.num}`, x + 14, y);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(h.name, x + 36, y + 1);
      ctx.fillStyle = "#f0d979";
      ctx.textAlign = "right";
      ctx.fillText(`${h.odds.toFixed(1)}倍`, x + 310, y + 1);
      ctx.textAlign = "left";
      ctx.fillStyle = "#8a96a3";
      ctx.font = "10px sans-serif";
      ctx.fillText(h.style, x + 36 + ctx.measureText(h.name).width + 110, y + 1);
    });
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 58px sans-serif";
    ctx.fillText(`${Math.ceil(-simT)}`, W / 2, H - 64);
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#f0d979";
    ctx.fillText("ファンファーレ🎺 まもなく発走！", W / 2, H - 26);
  } else if (simT < 1.1) {
    ctx.textAlign = "center";
    ctx.font = "bold 46px sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 7;
    ctx.strokeText("スタート！", W / 2, 130);
    ctx.fillStyle = "#fff";
    ctx.fillText("スタート！", W / 2, 130);
  }
  if (spurtT > 0 && simT - spurtT < 1.7 && remaining > 0) {
    const a = 1 - (simT - spurtT) / 1.7;
    ctx.textAlign = "center";
    ctx.font = "bold 38px sans-serif";
    ctx.strokeStyle = `rgba(120,40,0,${a})`;
    ctx.lineWidth = 6;
    ctx.strokeText("🔥 最後の直線！", W / 2, 120);
    ctx.fillStyle = `rgba(255,213,77,${a})`;
    ctx.fillText("🔥 最後の直線！", W / 2, 120);
  }
  if (flashT > 0 && simT - flashT > 6) {
    const win = ranking[0];
    const second = ranking[1].finishTime;
    const margin = second === null ? 1 : second - win.finishTime!;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(ctx, W / 2 - 290, 56, 580, 96, 12);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#f0d979";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(margin < 0.08 ? "📸 写真判定…！" : "🏆 1着確定！", W / 2, 94);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 21px sans-serif";
    ctx.fillText(
      `${win.num}番 ${win.name}  ${formatTime(win.finishTime!)}`,
      W / 2,
      130
    );
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- リアル寄りの馬体描画(横向き・4拍ギャロップ)
function drawHorse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: SimHorse,
  simT: number,
  sc: number,
  spurting: boolean
) {
  const running = simT > 0 && h.finishTime === null;
  const cooling = h.finishTime !== null;
  const t = (((h.pos * 0.155 + h.noiseSeed) % 1) + 1) % 1;
  const bob = running ? Math.sin(t * TW) * 2.4 : cooling ? Math.sin(t * TW) * 1 : 0;
  const pitch = running ? Math.sin(t * TW + 0.6) * 0.05 : 0;
  const rawWc = WAKU_COLORS[h.num - 1];
  const wc = rawWc === "#ffffff" ? "#e2e2e6" : rawWc;

  const coat = h.coat;
  const dark = shade(coat, -28);
  const darker = shade(coat, -48);
  const hasSock = (h.noiseSeed * 13) % 1 < 0.32;
  const hasBlaze = (h.noiseSeed * 7) % 1 < 0.3;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);

  // 影
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath();
  ctx.ellipse(0, 27, 34, 4.6, 0, 0, TW);
  ctx.fill();

  ctx.translate(0, bob);
  ctx.rotate(pitch);

  const grad = ctx.createLinearGradient(0, -16, 0, 16);
  grad.addColorStop(0, shade(coat, 24));
  grad.addColorStop(0.55, coat);
  grad.addColorStop(1, dark);

  const slow = running || cooling;
  const leg = (
    hipX: number,
    hipY: number,
    front: boolean,
    phase: number,
    col: string
  ) => {
    const tt = (t + phase) % 1;
    const sw = slow ? Math.sin(tt * TW) : 0;
    const fold = slow ? Math.max(0, Math.sin(tt * TW + 2.1)) : 0;
    const u = front ? sw * 0.95 - 0.08 : sw * 0.85 + 0.05;
    const l = front ? u - fold * 1.25 : u + fold * 0.95;
    const ul = front ? 12.5 : 13.5;
    const ll = 12.5;
    const kx = hipX + Math.sin(u) * ul;
    const ky = hipY + Math.cos(u) * ul;
    const fx = kx + Math.sin(l) * ll;
    const fy = ky + Math.cos(l) * ll;
    ctx.lineCap = "round";
    ctx.strokeStyle = col;
    ctx.lineWidth = front ? 4.6 : 5.4;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kx, ky);
    ctx.stroke();
    ctx.strokeStyle = hasSock ? "#e8e4da" : col;
    ctx.lineWidth = front ? 3.2 : 3.6;
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.fillStyle = "#1a130e";
    ctx.beginPath();
    ctx.ellipse(fx + 0.6, fy + 0.8, 2.6, 1.8, 0.3, 0, TW);
    ctx.fill();
  };

  // 奥側の脚
  leg(17, 3, true, 0.62, darker);
  leg(-19, 1, false, 0.13, darker);

  // 尻尾(3本のなびく束)
  const flut = running ? Math.sin(simT * 9 + h.noiseSeed) : 0;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = i === 1 ? shade(coat, -55) : darker;
    ctx.lineWidth = 4 - i;
    ctx.beginPath();
    ctx.moveTo(-30, -7 + i * 2);
    ctx.quadraticCurveTo(
      -42 - i * 2,
      -4 + flut * 2.5 + i * 3,
      -46 - i * 3,
      6 + flut * 3 + i * 4
    );
    ctx.stroke();
  }

  // 胴体(ベジェ曲線)
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-31, -8);
  ctx.bezierCurveTo(-35, 0, -31, 9, -22, 12);
  ctx.bezierCurveTo(-10, 15.5, 6, 15.5, 16, 12);
  ctx.bezierCurveTo(25, 9, 30, 3, 30, -4);
  ctx.bezierCurveTo(30, -8, 28, -10, 24, -11);
  ctx.bezierCurveTo(14, -13.5, 0, -14, -12, -12.5);
  ctx.bezierCurveTo(-22, -11.5, -28, -11, -31, -8);
  ctx.closePath();
  ctx.fill();
  // 後躯の筋肉ハイライト
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.ellipse(-18, -3, 10, 8, 0.2, 0, TW);
  ctx.fill();

  // 首(伸縮あり)
  const headX = 40 + (running ? Math.sin(t * TW + 0.7) * 2 : 0);
  const headY = -20 + (running ? Math.sin(t * TW) * 1.6 : 2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(14, -7);
  ctx.lineTo(headX - 4, headY + 1);
  ctx.stroke();

  // 頭部
  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(-0.32);
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.5, 4.6, 0, 0, TW);
  ctx.fill();
  ctx.fillStyle = shade(coat, -12);
  ctx.beginPath();
  ctx.ellipse(8, 1.2, 4.5, 3, 0.1, 0, TW);
  ctx.fill();
  if (hasBlaze) {
    ctx.strokeStyle = "rgba(245,243,238,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, -2.6);
    ctx.lineTo(9.5, 0.6);
    ctx.stroke();
  }
  // 耳
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(-6, -3.4);
  ctx.lineTo(-4.6, -8.4);
  ctx.lineTo(-2.2, -3.8);
  ctx.closePath();
  ctx.moveTo(-2.6, -3.8);
  ctx.lineTo(-0.8, -8);
  ctx.lineTo(1.2, -3.6);
  ctx.closePath();
  ctx.fill();
  // 目
  ctx.fillStyle = "#16100b";
  ctx.beginPath();
  ctx.arc(-1.6, -1.4, 1.1, 0, TW);
  ctx.fill();
  // 鼻革
  ctx.strokeStyle = "rgba(30,22,14,0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(3.6, -3.4);
  ctx.lineTo(5.4, 3.4);
  ctx.stroke();
  ctx.restore();

  // たてがみ
  ctx.strokeStyle = shade(coat, -52);
  for (let i = 0; i < 4; i++) {
    const p = i / 3;
    const mx = 14 + (headX - 6 - 14) * p;
    const my = -10 + (headY - 4 + 10) * p;
    ctx.lineWidth = 2.4 - i * 0.3;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(
      mx - 5,
      my - 1 + (running ? Math.sin(simT * 11 + i) * 1.6 : 0),
      mx - 8,
      my + 4
    );
    ctx.stroke();
  }

  // 腹帯
  ctx.strokeStyle = "rgba(235,235,225,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, -2);
  ctx.lineTo(-1, 14.5);
  ctx.stroke();

  // ゼッケン
  ctx.fillStyle = "#fafaf6";
  roundRect(ctx, -11, -13, 14, 14, 2.5);
  ctx.fill();
  ctx.strokeStyle = "#b9b9ae";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#16100b";
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${h.num}`, -4, -2.5);

  // 手前側の脚
  leg(15, 4, true, 0.5, dark);
  leg(-17, 2, false, 0.0, dark);

  // ---- 騎手
  const pump = running ? Math.sin(t * TW) * 0.8 : 0;
  // 近側の脚
  ctx.strokeStyle = "#f3f3ec";
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(7, -13);
  ctx.lineTo(13.5, -9.5);
  ctx.lineTo(10.5, -4);
  ctx.stroke();
  ctx.strokeStyle = "#241a12";
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(10.8, -4.8);
  ctx.lineTo(11.6, -1.6);
  ctx.stroke();
  // 胴体(勝負服)
  ctx.strokeStyle = wc;
  ctx.lineWidth = 7.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(5.5, -13.5);
  ctx.lineTo(14.5 + pump * 0.6, -21 + pump * 0.5);
  ctx.stroke();
  // 袖
  ctx.strokeStyle = shade(wc, -28);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(13.5, -19.5);
  ctx.lineTo(20.5, -14.5);
  ctx.stroke();
  // 手
  ctx.fillStyle = "#d8a47f";
  ctx.beginPath();
  ctx.arc(21, -14.3, 1.7, 0, TW);
  ctx.fill();
  // 手綱
  ctx.strokeStyle = "rgba(50,34,20,0.85)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(21, -14.3);
  ctx.lineTo(headX - 2, headY + 2.6);
  ctx.stroke();
  // ムチ(ラストスパート時)
  if (spurting && h.finishTime === null) {
    const wa = Math.sin(simT * 15 + h.num * 1.7) * 0.9 - 0.6;
    ctx.strokeStyle = "#6b4a2f";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(21, -14.3);
    ctx.lineTo(21 - Math.cos(wa) * 11, -14.3 - Math.sin(wa) * 11 - 5);
    ctx.stroke();
  }
  // 頭(あご→ヘルメット)
  ctx.fillStyle = "#d8a47f";
  ctx.beginPath();
  ctx.arc(17.6, -21.6, 2, 0, TW);
  ctx.fill();
  ctx.fillStyle = wc;
  ctx.strokeStyle = "#1c1c1c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(17.8, -23.6, 3.9, 0, TW);
  ctx.fill();
  ctx.stroke();
  // ゴーグル
  ctx.strokeStyle = "#101418";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(16, -22.6);
  ctx.lineTo(21.4, -23.2);
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
  race: RaceInfo;
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
    <section className="betting2 resultGrid">
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
        <h3>払戻オッズ</h3>
        <ul className="payoutList">
          <li>
            単勝 {order[0].num} — <b>{order[0].odds.toFixed(1)}倍</b>
          </li>
          <li>
            複勝{" "}
            {order
              .slice(0, 3)
              .map((h) => h.num)
              .join(", ")}{" "}
            — 各
            {order
              .slice(0, 3)
              .map((h) => ` ${placeOdds(h.odds).toFixed(1)}倍`)
              .join(" /")}
          </li>
          <li>
            馬連 {[order[0].num, order[1].num].sort((a, b) => a - b).join("-")}{" "}
            — <b>{quinellaOdds(order[0], order[1]).toFixed(1)}倍</b>
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
                <span
                  className="pAvatar sm"
                  style={{ background: PLAYER_COLORS[pi % 6] }}
                >
                  {p.name.slice(0, 1)}
                </span>{" "}
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
                {!myBets.length && (
                  <li className="muted">ノーベットだったよ</li>
                )}
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
