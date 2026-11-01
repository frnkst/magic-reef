import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/reef';

interface SoundSession {
  context: AudioContext;
  source: AudioBufferSourceNode | null;
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
      session.current = null;
      sound.source?.stop();
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
        const sound: SoundSession = { context, source: null };
        session.current = sound;
        // Unlock audio during the click, before waiting for the recording.
        await context.resume();
        const response = await fetch('/aquarium-water.wav', { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error('The water recording could not be loaded. Please try again.');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (session.current !== sound) return;
        const output = context.createGain();
        output.gain.value = 0.7;
        output.connect(context.destination);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(output);
        sound.source = source;
        source.start();
      }
      if (!session.current) return;
      const context = session.current.context;
      if (enabled || document.hidden) await context.suspend();
      else await context.resume();
      setEnabled(!enabled);
    } catch (cause) {
      const sound = session.current;
      session.current = null;
      sound?.source?.stop();
      if (sound) {
        void sound.context.close().catch((error: unknown) => {
          console.error('Could not close failed aquarium audio:', error);
        });
      }
      setEnabled(false);
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
