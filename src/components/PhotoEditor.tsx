import { useEffect, useRef, useState } from 'react';
import { prepareFish } from '../lib/cutout';
import { errorMessage, releaseFish } from '../lib/reef';
import type { Fish } from '../lib/reef';

type PreparedFish = Omit<Fish, 'id' | 'name'>;

export function PhotoEditor({ photo, token, demo, onDone, onCancel }: {
  photo: HTMLImageElement;
  token: string | null;
  demo: boolean;
  onDone: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<PreparedFish | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<Promise<PreparedFish> | null>(null);

  useEffect(() => {
    let active = true;
    setPreview(null);
    setAnalysisError('');
    // Reuse the request across React StrictMode's effect replay to avoid double billing.
    pending.current ??= prepareFish(photo, token, demo);
    pending.current.then((fish) => {
      if (active) setPreview(fish);
    }).catch((error: unknown) => {
      if (active) setAnalysisError(errorMessage(error));
    });
    return () => { active = false; };
  }, [photo, token, demo, attempt]);

  const release = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setSubmitError('');
    const fishName = name.trim() || 'Little fish';
    try {
      await releaseFish(token, { ...preview, name: fishName }, demo);
      onDone(fishName);
    } catch (error) {
      setSubmitError(errorMessage(error));
      setBusy(false);
    }
  };

  return (
    <div className="photo-editor ai-editor">
      <div className="editor-heading">
        <span className="eyebrow">02 / A little AI magic</span>
        <h1>{preview ? 'Meet your new fish.' : 'Finding their fins.'}</h1>
        <p>AI handles the cutout and swimming direction. The colors and lines are still entirely theirs.</p>
      </div>
      <section className="fish-options" aria-label="Automatically prepared fish">
        <div className={`cutout-preview${!preview && !analysisError ? ' preparing-preview' : ''}`} aria-busy={!preview && !analysisError}>
          {preview ? <img src={preview.image} alt="Your actual drawing, automatically cut out and oriented for swimming" />
            : <div className="ai-status" role="status">
              {!analysisError && <span className="ai-spinner" aria-hidden="true" />}
              <span>{analysisError ? 'Your fish needs another look.' : 'Finding the fish, keeping every little detail…'}</span>
            </div>}
          <span className="preview-caption">Original artwork. Not an AI-generated replacement.</span>
        </div>
        {analysisError && <>
          <p className="error" role="alert">{analysisError}</p>
          <button className="text-button" onClick={() => {
            pending.current = null;
            setAttempt((value) => value + 1);
          }}>Try AI preparation again</button>
        </>}
        {preview && <>
          <p className="field-hint">Check the preview before releasing. If AI missed a fin or included something extra, choose a clearer photo.</p>
          <label className="field-label" htmlFor="fish-name">What’s their name? <span>optional</span></label>
          <input id="fish-name" type="text" placeholder="e.g. Captain Bubbles" maxLength={40}
            value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
        </>}
        {submitError && <p className="error" role="alert">{submitError}</p>}
        <button className="button button-primary release-button" onClick={release} disabled={!preview || busy}>
          {busy ? 'Swimming to the aquarium…' : 'Release into the reef'} <span aria-hidden="true">↗</span>
        </button>
        <button className="text-button choose-again" onClick={onCancel} disabled={busy}>Choose a different photo</button>
        <p className="privacy-note">A resized photo is sent to OpenRouter and its AI provider for analysis. Only the approved cutout is saved in the aquarium.</p>
      </section>
    </div>
  );
}
