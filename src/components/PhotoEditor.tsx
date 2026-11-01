import { useEffect, useMemo, useState } from 'react';
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
  const [interpretation, setInterpretation] = useState(0);
  const [appliedInterpretation, setAppliedInterpretation] = useState(0);
  const pending = useMemo(() => new Map<number, Promise<PreparedFish>>(), [photo, token, demo]);
  const preparing = !preview && !analysisError;
  const changed = interpretation !== appliedInterpretation;

  useEffect(() => {
    let active = true;
    setPreview(null);
    setAnalysisError('');
    // Reuse the request across React StrictMode's effect replay to avoid double billing.
    let request = pending.get(appliedInterpretation);
    if (!request) {
      request = prepareFish(photo, token, demo, appliedInterpretation);
      pending.set(appliedInterpretation, request);
    }
    request.then((fish) => {
      if (active) setPreview(fish);
    }).catch((error: unknown) => {
      if (active) setAnalysisError(errorMessage(error));
    });
    return () => { active = false; };
  }, [photo, token, demo, attempt, appliedInterpretation, pending]);

  const release = async () => {
    if (!preview || busy || changed) return;
    setBusy(true);
    setSubmitError('');
    const fishName = name.trim() || (preview.kind === 'plant' ? 'Little plant' : preview.kind === 'submarine' ? 'Little submarine' : 'Little fish');
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
        <h1>{preview ? `Meet your new ${preview.kind ?? 'fish'}.` : 'Finding the little details.'}</h1>
        <p>Keep their artwork just as it is, or give AI a little room to fill in the blanks. You always approve the result first.</p>
      </div>
      <section className="fish-options" aria-label="Automatically prepared drawing">
        <div className="interpretation-control">
          <label className="field-label" htmlFor="ai-interpretation">A little help, or a little imagination? <span>{interpretation}%</span></label>
          <input id="ai-interpretation" type="range" min="0" max="100" step="5"
            value={interpretation} disabled={busy || preparing}
            aria-describedby="interpretation-hint"
            aria-valuetext={interpretation === 0 ? 'Keep the original drawing unchanged' : `${interpretation}% AI interpretation`}
            onChange={(event) => setInterpretation(Number(event.target.value))} />
          <div className="interpretation-labels"><span>Keep my drawing</span><span>Let AI fill it in</span></div>
          <p id="interpretation-hint" className="field-hint">{interpretation === 0
            ? 'Only remove the surrounding paper and turn it the right way. Colors and blank areas stay original.'
            : interpretation <= 30 ? 'Small repairs: close outline gaps and gently extend existing coloring.'
              : interpretation <= 70 ? 'Fill blank areas with nearby colors and gently tidy the shape. Keep the handmade character.'
                : 'More imagination: complete the coloring and interpret the shape, keeping their colors and special details.'}
            {interpretation > 0 && ' This edits the image with AI; the amount is creative guidance, not an exact pixel percentage.'}</p>
          {changed && <button className="button button-secondary interpretation-apply" disabled={busy || preparing}
            onClick={() => {
              setPreview(null);
              setAnalysisError('');
              setSubmitError('');
              setAppliedInterpretation(interpretation);
            }}>Update preview <span aria-hidden="true">↗</span></button>}
        </div>
        <div className={`cutout-preview${!preview && !analysisError ? ' preparing-preview' : ''}`} aria-busy={!preview && !analysisError}>
          {preview ? <img src={preview.image} alt={appliedInterpretation === 0 ? 'Your original drawing cut out for the aquarium' : 'AI-interpreted drawing to approve before adding it'} />
            : <div className="ai-status" role="status">
              {!analysisError && <span className="ai-spinner" aria-hidden="true" />}
              <span>{analysisError ? 'Your drawing needs another look.' : appliedInterpretation === 0 ? 'Finding the drawing, keeping every little detail…' : 'Filling in the blanks, keeping their imagination…'}</span>
            </div>}
          <span className="preview-caption">{changed ? 'Update the preview to see your new setting.' : appliedInterpretation === 0 ? 'Original artwork. Only the paper is removed.' : `AI-interpreted artwork · ${appliedInterpretation}% imagination`}</span>
        </div>
        {analysisError && <>
          <p className="error" role="alert">{analysisError}</p>
          <button className="text-button" onClick={() => {
            pending.delete(appliedInterpretation);
            setAttempt((value) => value + 1);
          }}>Try AI preparation again</button>
        </>}
        {preview && <>
          <p className="field-hint">{preview.kind === 'plant' ? 'This plant will stay anchored on the seabed.' : preview.kind === 'submarine' ? 'This submarine will cruise through the water. Sharks leave it alone.' : 'This fish will swim through the reef.'} Check the preview; choose a clearer photo if part of the drawing is missing.</p>
          <label className="field-label" htmlFor="fish-name">What’s their name? <span>optional</span></label>
          <input id="fish-name" type="text" placeholder="e.g. Captain Bubbles" maxLength={40}
            value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
        </>}
        {submitError && <p className="error" role="alert">{submitError}</p>}
        <button className="button button-primary release-button" onClick={release} disabled={!preview || busy || changed}>
          {busy ? 'Joining the aquarium…' : preview?.kind === 'plant' ? 'Plant on the seabed' : 'Release into the reef'} <span aria-hidden="true">↗</span>
        </button>
        <button className="text-button choose-again" onClick={onCancel} disabled={busy}>Choose a different photo</button>
        <p className="privacy-note">A resized photo is sent to OpenRouter and its AI provider for analysis and, above 0%, image editing. Updating the preview can use additional paid AI requests. Only the approved cutout is saved in the aquarium.</p>
      </section>
    </div>
  );
}
