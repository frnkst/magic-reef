import { useEffect, useMemo, useState } from 'react';
import { prepareFish } from '../lib/cutout';
import { errorMessage, releaseFish } from '../lib/reef';
import type { DrawingSize, Fish } from '../lib/reef';

type PreparedFish = Omit<Fish, 'id' | 'name'>;

export function PhotoEditor({ photo, token, demo, childNames, onDone, onCancel }: {
  photo: HTMLImageElement;
  token: string | null;
  demo: boolean;
  childNames: string[];
  onDone: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [child, setChild] = useState('');
  const [size, setSize] = useState<DrawingSize>('medium');
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
      await releaseFish(token, { ...preview, name: fishName, child: child.trim(), size }, demo);
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
          <fieldset className="drawing-size" disabled={busy}>
            <legend className="field-label">How big in the reef?</legend>
            <div className="size-choices">
              {(['small', 'medium', 'large'] as const).map((value) => <label key={value} className={`size-choice${size === value ? ' selected' : ''}`}>
                <input type="radio" name="drawing-size" value={value} checked={size === value} onChange={() => setSize(value)} />
                <svg width="48" height="40" viewBox="0 0 48 40" aria-hidden="true">
                  <g transform={`translate(24 20) scale(${value === 'small' ? 0.45 : value === 'medium' ? 0.7 : 1}) translate(-24 -20)`}>
                    {preview.kind === 'plant' ? <path d="M24 36V6m0 15C9 21 9 10 9 10s15 0 15 11Zm0 8c15 0 15-11 15-11s-15 0-15 11Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      : preview.kind === 'submarine' ? <><rect x="5" y="13" width="38" height="20" rx="10" fill="currentColor" /><path d="M25 14V7h7" fill="none" stroke="currentColor" strokeWidth="3" /><circle cx="24" cy="23" r="5" fill="var(--paper)" /></>
                        : <><path d="M7 20C14 6 31 6 39 20c-8 14-25 14-32 0Zm1 0L1 12v16Z" fill="currentColor" /><circle cx="31" cy="17" r="2" fill="var(--paper)" /></>}
                  </g>
                </svg>
                <span>{value[0].toUpperCase() + value.slice(1)}</span>
              </label>)}
            </div>
            <p className="field-hint">{size === 'small' ? 'A little reef companion.' : size === 'medium' ? 'Easy to spot, with plenty of room to swim.' : 'Big, bold, and impossible to miss.'} Size changes only how it appears in the aquarium, not the artwork.</p>
          </fieldset>
          <label className="field-label" htmlFor="child-name">Who drew it? <span>optional</span></label>
          <input id="child-name" type="text" placeholder="Child’s first name" maxLength={40} list="child-names"
            value={child} disabled={busy} autoComplete="off" onChange={(event) => setChild(event.target.value)} />
          <datalist id="child-names">{childNames.map((name) => <option key={name} value={name} />)}</datalist>
          <p className="field-hint">Use an existing name or type a new one. Parents can filter the reef by this name. First names or nicknames only: names are visible to anyone with the link.</p>
          <label className="field-label" htmlFor="fish-name">Drawing’s name <span>optional</span></label>
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
