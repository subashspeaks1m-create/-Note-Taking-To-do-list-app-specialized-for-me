import { useCallback } from 'react';
import { useDisplayPrefs } from './displayPrefs';

/**
 * Tiny synthesized sounds (no audio files): a soft two-note chime for a
 * finished task and a rising arpeggio for an unlock. Off by default; every
 * failure is silent because sound is never essential.
 */
let ctx: AudioContext | null = null;

const NOTES: Record<'complete' | 'unlock', number[]> = {
  complete: [659.25, 987.77],
  unlock: [523.25, 659.25, 783.99, 1046.5],
};

export function playSound(kind: keyof typeof NOTES, volume = 0.12): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const start = ctx.currentTime + 0.01;
    NOTES[kind].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      const t = start + i * (kind === 'unlock' ? 0.09 : 0.07);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch {
    // No audio available; stay quiet.
  }
}

export function useSound(): (kind: keyof typeof NOTES) => void {
  const { prefs } = useDisplayPrefs();
  const on = prefs.sound === 'on';
  return useCallback((kind) => {
    if (on) playSound(kind);
  }, [on]);
}
