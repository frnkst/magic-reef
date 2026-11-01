import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Aquarium } from './components/Aquarium';
import { PhotoEditor } from './components/PhotoEditor';
import { sampleFish } from './lib/drawings';
import { openPhoto } from './lib/cutout';
import { configured, createTank, errorMessage, loadFish, MAX_FISH, readDemoFish, reefLink } from './lib/reef';
import type { Fish } from './lib/reef';

const params = new URLSearchParams(window.location.search);
const token = params.get('tank');
const demo = params.get('demo') === '1';
const upload = params.get('view') === 'upload';
const validToken = token !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
const hasTank = demo || validToken;

function Logo({ light = false }: { light?: boolean }) {
  return <a className={`logo${light ? ' logo-light' : ''}`} href="/" aria-label="Magic Reef home">
    <svg width="38" height="28" viewBox="0 0 50 34" aria-hidden="true">
      <path d="M33 17 47 5v24ZM3 17C11 1 28 1 37 17c-9 16-26 16-34 0" fill="currentColor" />
      <circle cx="13" cy="14" r="2.2" fill={light ? '#063d45' : '#fff8eb'} />
    </svg>
    <span>magic reef<span className="logo-dot">.</span></span>
  </a>;
}

export function App() {
  const [samples, setSamples] = useState<Fish[]>([]);
  const [fish, setFish] = useState<Fish[]>([]);
  const [syncError, setSyncError] = useState('');
  const [graphicsError, setGraphicsError] = useState('');
  const [synced, setSynced] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [invite, setInvite] = useState(true);
  const [qr, setQr] = useState('');
  const [qrError, setQrError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [immersive, setImmersive] = useState(false);
  const [savedTank, setSavedTank] = useState<string | null>(null);
  const previous = useRef<Fish[]>([]);
  const graphicsFailure = useCallback((message: string) => setGraphicsError(message), []);
  const phoneLink = reefLink(token, demo, true);

  useEffect(() => {
    let active = true;
    sampleFish().then((drawings) => {
      if (active) setSamples(drawings);
    }).catch((error: unknown) => {
      if (active) setGraphicsError(errorMessage(error));
    });
    try {
      const saved = localStorage.getItem('magic-reef-last-tank');
      if (saved && /^[0-9a-f-]{36}$/i.test(saved)) setSavedTank(saved);
    } catch (error) {
      setStartError(`Your browser blocked saved links: ${errorMessage(error)}`);
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hasTank) return;
    let active = true;
    let timeout = 0;
    const sync = async () => {
      if (document.hidden) {
        if (active) timeout = window.setTimeout(sync, 3000);
        return;
      }
      try {
        const next = demo ? readDemoFish() : await loadFish(token!, previous.current);
        if (!active) return;
        previous.current = next;
        setFish(next);
        setSynced(true);
        setSyncError('');
      } catch (error) {
        if (active) {
          setSynced(false);
          setSyncError(errorMessage(error));
        }
      }
      if (active) timeout = window.setTimeout(sync, 3000);
    };
    void sync();
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!hasTank || demo || upload) return;
    let active = true;
    QRCode.toDataURL(phoneLink, {
      width: 220, margin: 2, color: { dark: '#123e43', light: '#fff8eb' },
      errorCorrectionLevel: 'M',
    }).then((data) => {
      if (active) setQr(data);
    }).catch((error: unknown) => {
      if (active) setQrError(`Could not make the QR code: ${errorMessage(error)}. Use the link below.`);
    });
    return () => { active = false; };
  }, [phoneLink]);

  useEffect(() => {
    const changed = () => setImmersive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setStartError('');
    try {
      const newToken = await createTank();
      try {
        localStorage.setItem('magic-reef-last-tank', newToken);
      } catch {
        window.alert('Your browser could not remember the aquarium. Bookmark the next page to keep its link.');
      }
      window.location.assign(reefLink(newToken, false));
    } catch (error) {
      setStartError(errorMessage(error));
      setStarting(false);
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(phoneLink);
      setCopyStatus('Link copied');
    } catch {
      setCopyStatus('Copy was blocked. Select and copy the link below.');
    }
  };
  const fullscreen = async () => {
    setStartError('');
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        setStartError(`Could not leave fullscreen: ${errorMessage(error)}`);
      }
    } else if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (error) {
        setStartError(`Fullscreen was blocked: ${errorMessage(error)}`);
      }
    } else {
      setImmersive((value) => !value);
    }
  };

  if (upload) {
    return <UploadPage connected={hasTank && (demo || configured)} syncError={syncError} synced={synced} count={fish.length} />;
  }

  if (token && !validToken) {
    return <main className="invalid-page"><Logo /><h1>This link is missing a little magic.</h1><p>The aquarium link is invalid. Scan the QR code on the laptop again.</p><a className="button button-primary" href="/">Go home →</a></main>;
  }

  if (!hasTank) {
    return <main className="landing">
      <header className="landing-header"><Logo /><span className="small-note">Made of paper. Full of possibility.</span></header>
      <div className="landing-body">
        <section className="intro">
          <span className="eyebrow"><span className="little-star" aria-hidden="true">✳</span> A little ocean for big imaginations</span>
          <h1>From the kitchen<br />table to the<br /> <em>deep blue.</em></h1>
          <p>A fish, a few crayons, a little magic.<br />Let your children’s drawings swim in an aquarium of their very own.</p>
          <div className="intro-actions">
            <button className="button button-primary" onClick={start} disabled={starting || !configured}>
              {starting ? 'Making room in the ocean…' : 'Create an aquarium'} <span aria-hidden="true">↗</span>
            </button>
            <a className="text-button" href="/?demo=1">Try the local demo →</a>
            {savedTank && configured && <a className="text-button resume-link" href={reefLink(savedTank, false)}>Return to your aquarium</a>}
          </div>
          {!configured && <p className="setup-note">The demo is ready. To connect a phone and laptop, add the Supabase keys described in the README.</p>}
          {startError && <p className="error" role="alert">{startError}</p>}
          <div className="intro-bottom"><span className="scribble" aria-hidden="true">〰</span><span>No special templates. No perfect drawings.<br />Just their imagination, exactly as it is.</span></div>
        </section>
        <section className="landing-reef" aria-label="A preview of your paper aquarium">
          <Aquarium fish={samples} onError={graphicsFailure} />
          <div className="preview-topline"><span className="status-dot" /> A glimpse of the reef <span>01 — ∞</span></div>
          <span className="reef-note">a whole new world<br /><em>for their little creations</em></span>
          <span className="preview-bottomline">THE DRAWING IS THE FISH.</span>
          {graphicsError && <p className="scene-error error" role="alert">{graphicsError}</p>}
        </section>
      </div>
      <footer className="how-it-works">
        <div><span>01</span><p><strong>Draw something fishy.</strong>Crayons, markers, wild ideas. White paper works best.</p></div>
        <div><span>02</span><p><strong>Give it a close-up.</strong>Scan the aquarium’s QR code. AI cuts out and orients the drawing.</p></div>
        <div><span>03</span><p><strong>Watch it find its fins.</strong>Release your fish from the phone. Look up at the laptop.</p></div>
      </footer>
    </main>;
  }

  const displayed = demo ? [...samples, ...fish] : fish;
  return <main className={`tank-page${immersive ? ' immersive' : ''}`}>
    <Aquarium fish={displayed} onError={graphicsFailure} />
    <header className="tank-header">
      <Logo light />
      <div className="tank-tools">
        <button className="glass-button" onClick={() => setInvite((value) => !value)}>{invite ? 'Hide' : 'Add a fish'} <span aria-hidden="true">＋</span></button>
        <button className="glass-button fullscreen-button" onClick={fullscreen}>Full screen <span aria-hidden="true">⛶</span></button>
      </div>
    </header>
    {invite && <aside className="invite-card">
      <span className="eyebrow">{demo ? 'A little practice ocean' : 'The next fish is yours'}</span>
      <h1>Bring a drawing<br /><em>to life.</em></h1>
      {demo ? <>
        <p>This demo lives in this browser only. AI uploads work locally with an OpenRouter key; deployed uploads need a shared aquarium.</p>
        <a className="button button-primary" href={phoneLink}>Add a drawing <span aria-hidden="true">↗</span></a>
        <p className="field-hint">The three starter fish are original sample drawings.</p>
      </> : <>
        <p>Scan with your phone. Take a photo of a paper fish. Watch it swim here.</p>
        <div className="qr-code">{qr ? <img src={qr} width="180" height="180" alt="QR code to add a drawing from your phone" /> : <span>{qrError || 'Preparing your phone link…'}</span>}</div>
        <a className="phone-link" href={phoneLink}>Or add a fish on this device ↗</a>
        <button className="text-button copy-button" onClick={copyLink}>Copy phone link</button>
        <span className="copy-status" role="status">{copyStatus}</span>
        <input className="share-link" aria-label="Phone upload link" value={phoneLink} readOnly onFocus={(event) => event.target.select()} />
        <p className="privacy-note">Keep this link in your family. Anyone with it can view this aquarium and add fish.</p>
      </>}
    </aside>}
    {!demo && synced && fish.length === 0 && <div className="empty-reef"><span className="little-star" aria-hidden="true">✳</span><h2>Every ocean starts<br />with one little fish.</h2><p>Draw yours. We’ll keep the water warm.</p></div>}
    <footer className="tank-footer">
      <span className="tank-status"><span className={`status-dot${!synced ? ' status-pending' : ''}`} />{demo ? 'Local demo · this browser only' : synced ? 'Connected · waiting for little masterpieces' : 'Reconnecting…'}</span>
      <span>{displayed.length} {displayed.length === 1 ? 'fish' : 'fish'} in the reef</span>
    </footer>
    {(syncError || graphicsError || startError) && <div className="tank-errors" role="alert">
      {syncError && <p>{syncError} Retrying every few seconds.</p>}
      {graphicsError && <p>{graphicsError}</p>}
      {startError && <p>{startError}</p>}
    </div>}
    {immersive && <button className="exit-immersive glass-button" onClick={() => {
      if (document.fullscreenElement) void fullscreen();
      else setImmersive(false);
    }}>Exit full screen ⛶</button>}
  </main>;
}

function UploadPage({ connected, syncError, synced, count }: {
  connected: boolean; syncError: string; synced: boolean; count: number;
}) {
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [released, setReleased] = useState('');
  const choose = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      setPhoto(await openPhoto(file));
      setReleased('');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  };
  return <main className="upload-page">
    <header className="upload-header"><Logo /><a className="text-button" href={reefLink(token, demo)}>See aquarium ↗</a></header>
    {demo && <div className="demo-banner">Local demo — drawings stay in this browser, not on another device.</div>}
    {!connected ? <section className="capture-intro"><h1>This phone needs<br />an aquarium.</h1><p>{hasTank ? 'Supabase is not configured. Add the environment variables and redeploy to connect your devices.' : 'Scan the QR code on the laptop to open the correct upload link.'}</p><a className="button button-primary" href="/">Back home →</a></section>
      : released ? <section className="success-page">
        <span className="success-mark" aria-hidden="true">✳</span>
        <span className="eyebrow">03 / Into the big blue</span>
        <h1>{released} has<br /><em>found their fins.</em></h1>
        <p>{demo ? 'Your drawing is saved in this browser’s demo aquarium.' : 'Look up at the laptop. Your fish will swim in within a few seconds.'}</p>
        <button className="button button-primary" onClick={() => { setReleased(''); setPhoto(null); }}>Add another drawing <span aria-hidden="true">＋</span></button>
        <a className="text-button" href={reefLink(token, demo)}>Watch the aquarium →</a>
      </section>
      : photo ? <PhotoEditor photo={photo} token={token} demo={demo} onCancel={() => setPhoto(null)} onDone={(name) => { setReleased(name); setPhoto(null); }} />
      : <section className="capture-intro">
        <span className="eyebrow">01 / From paper to possibility</span>
        <h1>One drawing.<br /><em>A whole new life.</em></h1>
        <p>Your crayons did the hard work.<br />Let’s help your fish find the ocean.</p>
        <div className="capture-illustration" aria-hidden="true">
          <svg viewBox="0 0 240 180"><g transform="rotate(-8 120 90)"><rect x="37" y="17" width="165" height="145" rx="3" fill="#fffdf5" stroke="#d9d6c3" strokeWidth="2"/><path d="m149 92 31-25-2 48-29-17M61 92c18-39 67-37 93 1-25 38-72 35-93-1Z" fill="#f4be75" stroke="#986f43" strokeWidth="3"/><path d="m110 61-6 61m25-52-6 45" stroke="#da9259" strokeWidth="6"/><circle cx="82" cy="84" r="5" fill="#624a37"/></g><path d="m205 33 5-11m5 18 12-2M31 127l-12 4" stroke="#7b9c83" strokeWidth="3" strokeLinecap="round"/></svg>
        </div>
        {count >= MAX_FISH ? <p className="error">This aquarium is full (40 drawings).</p> : <>
          <label className={`button button-primary camera-button${loading ? ' disabled' : ''}`}>
            {loading ? 'Opening your photo…' : 'Take a photo'} <span aria-hidden="true">↗</span>
            <input type="file" accept="image/*" capture="environment" disabled={loading || (!demo && !synced)}
              onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          <label className="text-button library-button">Or choose from your photos
            <input type="file" accept="image/*" disabled={loading || (!demo && !synced)}
              onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
        </>}
        <p className="photo-tip"><strong>A small tip for a great fish</strong>Use plain white paper and a closed, dark outline. Photograph from straight above in good light, with no hands or other drawings in the frame.</p>
        <p className="privacy-note">Selecting a photo sends a resized copy to OpenRouter and its AI provider to find the fish. Avoid faces and personal details. You approve the cutout before it is saved in the aquarium.</p>
        {error && <p className="error" role="alert">{error}</p>}
      </section>}
    {syncError && <p className="upload-sync-error error" role="alert">{syncError} Retrying…</p>}
    {connected && !synced && !syncError && <p className="upload-sync-error" role="status">Connecting to your aquarium…</p>}
    <footer className="upload-footer">Their imagination. Unmistakably theirs.</footer>
  </main>;
}
