import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/reef';

interface SoundSession {
  context: AudioContext;
  noise: AudioBufferSourceNode;
}

export function AquariumSound() {
  const session = useRef<SoundSession | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      const sound = session.current;
      if (!sound) return;
      sound.noise.stop();
      void sound.context.close().catch((cause: unknown) => {
        console.error('Could not close aquarium audio:', cause);
      });
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const visibilityChanged = () => {
      const context = session.current?.context;
      if (!context || context.state === 'closed') return;
      const operation = document.hidden ? context.suspend() : context.resume();
      void operation.catch((cause: unknown) => {
        setError(`Aquarium sound was interrupted: ${errorMessage(cause)}. Toggle sound to try again.`);
        setEnabled(false);
      });
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => document.removeEventListener('visibilitychange', visibilityChanged);
  }, [enabled]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!session.current) {
        if (!window.AudioContext) throw new Error('This browser does not support aquarium sound.');
        const context = new AudioContext();
        const output = context.createGain();
        output.gain.value = 0.55;
        output.connect(context.destination);
        const buffer = context.createBuffer(1, context.sampleRate * 12, context.sampleRate);
        const samples = buffer.getChannelData(0);
        let flow = 0;
        let ripple = 0;
        for (let index = 0; index < samples.length; index++) {
          const white = Math.random() * 2 - 1;
          flow = (flow + white * 0.02) / 1.02;
          ripple = ripple * 0.99995 + Math.random() * 0.0001;
          samples[index] = (flow * 3.5 + white * 0.12) * (0.65 + ripple * 0.35);
        }
        const noise = context.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        filter.Q.value = 0.5;
        const lowCut = context.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 160;
        lowCut.Q.value = 0.5;
        const water = context.createGain();
        water.gain.value = 0.3;
        noise.connect(lowCut).connect(filter).connect(water).connect(output);
        noise.start();
        session.current = { context, noise };
      }
      const context = session.current.context;
      if (enabled) await context.suspend();
      else await context.resume();
      setEnabled(!enabled);
    } catch (cause) {
      setError(`Could not play aquarium sound: ${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  return <div className="sound-control">
    <button className="glass-button sound-button" onClick={() => { void toggle(); }} disabled={busy}
      aria-pressed={enabled} aria-label={enabled ? 'Mute aquarium sounds' : 'Play aquarium sounds'}
      title={enabled ? 'Mute aquarium sounds' : 'Play aquarium sounds'}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4Z" strokeLinejoin="round" />
        {enabled ? <path d="M17 8q4 4 0 8m3-11q7 7 0 14" strokeLinecap="round" />
          : <path d="m17 9 5 6m0-6-5 6" strokeLinecap="round" />}
      </svg>
      <span className="sound-label">{enabled ? 'Sound on' : 'Sound off'}</span>
    </button>
    {error && <p className="error sound-error" role="alert">{error}</p>}
  </div>;
}
