// レース用BGM・効果音をWeb Audio APIでリアルタイム合成する
// (音源ファイル不使用・全てオリジナルのシンセ音)

export class RaceAudio {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowd: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private bpm = 152;
  private intense = false;
  private disposed = false;

  constructor(muted: boolean) {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = muted ? 0 : 0.32;
      this.master.connect(this.ac.destination);
      this.ac.resume();
      this.startCrowdBed();
    } catch {
      this.ac = null;
    }
  }

  setMuted(m: boolean) {
    if (this.ac && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.32, this.ac.currentTime, 0.04);
    }
  }

  dispose() {
    this.disposed = true;
    if (this.timer !== null) clearInterval(this.timer);
    if (this.ac) {
      try {
        this.ac.close();
      } catch {}
    }
    this.ac = null;
  }

  // ---------------- 基本パーツ ----------------
  private tone(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    filterFreq?: number,
    slideTo?: number
  ) {
    if (!this.ac || !this.master) return;
    const osc = this.ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node: AudioNode = osc;
    if (filterFreq) {
      const f = this.ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = filterFreq;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseBuffer(): AudioBuffer | null {
    if (!this.ac) return null;
    const len = this.ac.sampleRate * 2;
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private noiseHit(
    t: number,
    dur: number,
    gain: number,
    filterType: BiquadFilterType,
    filterFreq: number
  ) {
    if (!this.ac || !this.master) return;
    const buf = this.noiseBuffer();
    if (!buf) return;
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    const f = this.ac.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = filterFreq;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ---------------- 観客のざわめき(常時) ----------------
  private startCrowdBed() {
    if (!this.ac || !this.master) return;
    const buf = this.noiseBuffer();
    if (!buf) return;
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 700;
    f.Q.value = 0.6;
    this.crowd = this.ac.createGain();
    this.crowd.gain.value = 0.05;
    src.connect(f);
    f.connect(this.crowd);
    this.crowd.connect(this.master);
    src.start();
  }

  private crowdLevel(level: number, ramp = 0.6) {
    if (this.ac && this.crowd) {
      this.crowd.gain.setTargetAtTime(level, this.ac.currentTime, ramp);
    }
  }

  // ---------------- ファンファーレ(発走前) ----------------
  fanfare() {
    if (!this.ac) return;
    const t0 = this.ac.currentTime + 0.08;
    const brass = (
      freq: number,
      t: number,
      dur: number,
      gain = 0.34
    ) => {
      this.tone(freq, t0 + t, dur, "sawtooth", gain, 1500);
      this.tone(freq * 0.5, t0 + t, dur, "square", gain * 0.4, 900);
    };
    const G4 = 392,
      C5 = 523.3,
      E5 = 659.3,
      G5 = 784,
      C6 = 1046.5;
    brass(G4, 0, 0.18);
    brass(C5, 0.2, 0.18);
    brass(E5, 0.4, 0.18);
    brass(G5, 0.6, 0.42);
    brass(E5, 1.1, 0.18);
    brass(G5, 1.3, 0.6);
    // 締めの和音3連発 → 高音ロング
    for (let i = 0; i < 3; i++) {
      const t = 2.0 + i * 0.32;
      brass(C5, t, 0.22, 0.26);
      brass(E5, t, 0.22, 0.26);
      brass(G5, t, 0.22, 0.26);
    }
    brass(C6, 2.95, 0.6, 0.3);
    brass(G5, 2.95, 0.6, 0.22);
    // スネアロール
    for (let i = 0; i < 14; i++) {
      this.noiseHit(t0 + 2.0 + i * 0.07, 0.05, 0.07, "bandpass", 2200);
    }
  }

  // ---------------- レース中BGMループ ----------------
  startRace() {
    if (!this.ac || this.timer !== null) return;
    this.crowdLevel(0.09);
    this.nextTime = this.ac.currentTime + 0.06;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 28);
  }

  finalStretch() {
    this.intense = true;
    this.bpm = 162;
    this.crowdLevel(0.22, 0.4);
  }

  goal() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.ac) return;
    // 大歓声
    this.crowdLevel(0.5, 0.08);
    setTimeout(() => !this.disposed && this.crowdLevel(0.12, 1.8), 2600);
    // 勝利ジングル
    const t0 = this.ac.currentTime + 0.35;
    const A4 = 440,
      Cs5 = 554.4,
      E5 = 659.3,
      A5 = 880;
    [A4, Cs5, E5, A5].forEach((f, i) => {
      this.tone(f, t0 + i * 0.13, 0.3, "sawtooth", 0.3, 1800);
    });
    this.tone(A5, t0 + 0.55, 0.9, "sawtooth", 0.32, 2000);
    this.tone(E5, t0 + 0.55, 0.9, "sawtooth", 0.22, 1600);
    this.tone(Cs5, t0 + 0.55, 0.9, "square", 0.12, 1200);
  }

  private schedule() {
    if (!this.ac) return;
    const spb = 60 / this.bpm / 2; // 8分音符
    while (this.nextTime < this.ac.currentTime + 0.14) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 16;
    }
  }

  private playStep(s: number, t: number, spb: number) {
    // キック(4つ打ち)
    if (s % 4 === 0) {
      this.tone(140, t, 0.12, "sine", 0.85, undefined, 45);
    }
    // ハイハット
    this.noiseHit(t, 0.03, this.intense ? 0.16 : 0.1, "highpass", 6500);
    if (this.intense) {
      this.noiseHit(t + spb / 2, 0.025, 0.09, "highpass", 7500);
    }
    // スネア
    if (s === 4 || s === 12) {
      this.noiseHit(t, 0.09, 0.22, "bandpass", 1900);
      this.tone(190, t, 0.08, "triangle", 0.25);
    }
    // ベース(Aマイナー疾走パターン)
    const A2 = 110,
      C3 = 130.8,
      D3 = 146.8,
      E3 = 164.8,
      G2 = 98;
    const bass = [
      A2, A2, E3, A2, C3, C3, A2, A2,
      D3, D3, A2, D3, E3, E3, G2, E3,
    ];
    this.tone(bass[s], t, spb * 0.85, "sawtooth", 0.4, 520);
    // リードアルペジオ
    const A4 = 440,
      C5 = 523.3,
      D5 = 587.3,
      E5 = 659.3,
      G5 = 784;
    const lead = [
      A4, 0, C5, E5, 0, D5, E5, 0,
      G5, 0, E5, D5, 0, C5, D5, E5,
    ];
    if (lead[s]) {
      const f = this.intense ? lead[s] * 2 : lead[s];
      this.tone(f, t, spb * 0.8, "square", this.intense ? 0.13 : 0.1, 2600);
    }
  }
}
