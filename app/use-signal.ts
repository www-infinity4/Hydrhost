"use client";

/**
 * useSignal — Hydrogen Shell Signal Engine
 *
 * Each device has a unique carrier: a pulsing dual-tone chord derived from
 * its phone-number blocks (proton state).  When connected, the microphone
 * is attached as voice electrons riding the carrier through the shell.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { CallPhase } from "./types";
import type { SignalConfig } from "./phone-utils";

export type { SignalConfig } from "./phone-utils";

export interface SignalHandle {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  micActive: boolean;
  audioError: string | null;
}

export function useSignal(
  myConfig: SignalConfig | null,
  phase: CallPhase,
  targetConfig: SignalConfig | null = null,
): SignalHandle {
  const ctxRef       = useRef<AudioContext | null>(null);
  const oscARef      = useRef<OscillatorNode | null>(null);
  const oscBRef      = useRef<OscillatorNode | null>(null);
  const gainRef      = useRef<GainNode | null>(null);
  const pulseTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const rafRef       = useRef<number | null>(null);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const [micActive,  setMicActive]  = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => null);
    }
    return ctxRef.current;
  }, []);

  const stopOscillators = useCallback(() => {
    try { oscARef.current?.stop(); } catch { /* already stopped */ }
    try { oscBRef.current?.stop(); } catch { /* already stopped */ }
    oscARef.current = null;
    oscBRef.current = null;
    if (pulseTimer.current) { clearTimeout(pulseTimer.current); pulseTimer.current = null; }
  }, []);

  const stopMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    analyserRef.current = null;
    setMicActive(false);
  }, []);

  const stopCanvas = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const startOscillators = useCallback(
    (ctx: AudioContext, fA: number, fB: number, vol: number) => {
      stopOscillators();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.connect(ctx.destination);
      gainRef.current = gain;
      const oA = ctx.createOscillator();
      oA.type = "sine"; oA.frequency.value = fA;
      oA.connect(gain); oA.start();
      oscARef.current = oA;
      const oB = ctx.createOscillator();
      oB.type = "sine"; oB.frequency.value = fB;
      oB.connect(gain); oB.start();
      oscBRef.current = oB;
      return gain;
    },
    [stopOscillators],
  );

  const startPulse = useCallback(
    (ctx: AudioContext, config: SignalConfig, sweep: boolean) => {
      const { freqA, freqB, pulseOnMs, pulseOffMs, gain: vol } = config;
      const gain = startOscillators(ctx, freqA, freqB, vol);
      let step = 0;
      const tick = (on: boolean) => {
        if (!gainRef.current) return;
        const now = ctx.currentTime;
        if (on) {
          if (sweep && oscARef.current && oscBRef.current) {
            step++;
            oscARef.current.frequency.setValueAtTime(freqA + step * 18, now);
            oscBRef.current.frequency.setValueAtTime(freqB + step * 18, now);
          }
          gain.gain.setTargetAtTime(vol, now, 0.01);
        } else {
          gain.gain.setTargetAtTime(0, now, 0.01);
        }
        pulseTimer.current = setTimeout(() => tick(!on), on ? pulseOnMs : pulseOffMs);
      };
      tick(true);
    },
    [startOscillators],
  );

  const startRing = useCallback(
    (ctx: AudioContext, target: SignalConfig) => {
      const gain = startOscillators(ctx, target.freqA, target.freqB, 0.18);
      const tick = (on: boolean) => {
        if (!gainRef.current) return;
        gain.gain.setTargetAtTime(on ? 0.18 : 0, ctx.currentTime, 0.02);
        pulseTimer.current = setTimeout(() => tick(!on), on ? 2000 : 4000);
      };
      tick(true);
    },
    [startOscillators],
  );

  const startMic = useCallback(async (ctx: AudioContext) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      analyserRef.current = analyser;
      setMicActive(true);
      setAudioError(null);
    } catch (e) {
      setAudioError(e instanceof Error ? e.message : "Microphone unavailable");
      setMicActive(false);
    }
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const W = canvas.width; const H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);

    const analyser = analyserRef.current;
    if (!analyser) {
      // Decorative idle sine
      const t = Date.now() / 300;
      ctx2d.beginPath();
      ctx2d.strokeStyle = "rgba(22,163,74,0.45)";
      ctx2d.lineWidth = 2;
      for (let x = 0; x < W; x++) {
        const y = H / 2 + Math.sin((x / W) * Math.PI * 6 + t) * (H * 0.28);
        x === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();
      rafRef.current = requestAnimationFrame(drawWaveform);
      return;
    }

    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(data);
    ctx2d.beginPath();
    ctx2d.strokeStyle = "rgba(22,163,74,0.9)";
    ctx2d.lineWidth = 2;
    const sliceW = W / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const y = ((data[i] / 128.0) * H) / 2;
      i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
      x += sliceW;
    }
    ctx2d.lineTo(W, H / 2);
    ctx2d.stroke();
    rafRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  useEffect(() => {
    if (!myConfig) return;
    stopOscillators(); stopMic(); stopCanvas(); analyserRef.current = null;
    const ctx = getCtx();
    if (phase === "idle")                          startPulse(ctx, myConfig, false);
    else if (phase === "scanning")                 startPulse(ctx, myConfig, true);
    else if (phase === "ringing" && targetConfig)  startRing(ctx, targetConfig);
    else if (phase === "connected") {
      startOscillators(ctx, myConfig.freqA, myConfig.freqB, 0.02);
      gainRef.current?.gain.setValueAtTime(0.02, ctx.currentTime);
      startMic(ctx).catch(() => null);
    }
    rafRef.current = requestAnimationFrame(drawWaveform);
    return () => { stopOscillators(); stopMic(); stopCanvas(); };
    /**
     * Intentionally omitting the stable useCallback functions from deps.
     * They all operate exclusively through refs (oscARef, gainRef, etc.) so
     * there is no stale-closure risk; adding them would cause the effect to
     * re-run on every render and restart audio unnecessarily.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, myConfig?.freqA, myConfig?.freqB, targetConfig?.freqA]);

  return { canvasRef, micActive, audioError };
}
