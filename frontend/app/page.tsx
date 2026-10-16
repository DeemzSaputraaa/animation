'use client';
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { ScriptEditor } from '../components/ScriptEditor';
import { PlayerControls } from '../components/PlayerControls';
import { PerformanceTimeline } from '../components/PerformanceTimeline';
import { useAvatarStore } from '../stores/avatarStore';
import { CHARACTERS, type CharacterId } from '../characters';
import { ExpressionControls } from '../components/ExpressionControls';
const AvatarScene = dynamic(() => import('../components/AvatarScene'), { ssr: false, loading: () => <div className="scene-loading">Menyiapkan studio…</div> });
const labels = { idle: 'Siap berkarya', generating: 'Membuat performa', ready: 'Siap diputar', playing: 'Sedang diputar', paused: 'Dijeda', finished: 'Selesai', error: 'Perlu dicoba lagi' };
export default function Home() {
  const state = useAvatarStore(s => s.state), focus = useAvatarStore(s => s.focusFace), modelError = useAvatarStore(s => s.modelError);
  const character = useAvatarStore(s => s.character);
  const modelReady = useAvatarStore(s => s.modelReady);
  useEffect(() => {
    const hide = () => { if (document.hidden && useAvatarStore.getState().state === 'playing') useAvatarStore.getState().pause(); };
    const unload = () => { useAvatarStore.getState().cancel(); useAvatarStore.getState().stop(); };
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', unload);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', unload); };
  }, []);
  return <main className="studio-shell">
    <header className="app-header"><a className="brand" href="/" aria-label="Ruang Cerita beranda"><span className="brand-icon">rc<span>•</span></span><div>Ruang Cerita<small>AVATAR PRESENTER STUDIO</small></div></a><div className="header-note"><span className="tiny-dot" /> Studio pribadi Anda</div><span className="version-tag">MVP / 01</span></header>
    <div className="page-intro"><div><div className="eyebrow">DARI NASKAH, MENJADI CERITA.</div><h1>Beri cerita Anda <em>kehadiran.</em></h1><p>Suara, ekspresi, dan gerakan — dalam satu presenter virtual.</p></div><div className="workflow"><span>01 Tulis</span><i>→</i><span>02 Generate</span><i>→</i><span>03 Putar</span></div></div>
    <div className="studio-grid"><div className="preview-column"><section className="preview-panel" aria-label="Preview karakter 3D" data-ready={modelReady}>
      <div className="preview-top"><span><i className="tiny-dot" /> LIVE PREVIEW</span><span className={`status-pill ${state}`} role="status">{labels[state]}</span></div>
      <div className="scene"><AvatarScene /></div>
      <div className="preview-bottom"><div><label className="sr-only" htmlFor="character">Pilih karakter</label><select id="character" className="character-select" value={character} onChange={event => useAvatarStore.getState().setCharacter(event.target.value as CharacterId)}>{Object.entries(CHARACTERS).map(([id, model]) => <option key={id} value={id}>{model.name}</option>)}</select><span>Suara Ardi · Bahasa Indonesia</span></div><button className="focus-button" aria-pressed={focus} onClick={() => useAvatarStore.getState().setFocusFace(!focus)}>{focus ? '↙ Seluruh tubuh' : '↗ Fokus wajah'}</button></div>
      <div className="stage-hint">Geser untuk memutar · Scroll untuk mendekat</div>
    </section><ExpressionControls /><div className="playback-panel"><div className="section-heading"><span className="step-number">02</span><h2>Pratinjau performa</h2><span className="section-meta">Audio & gerakan selaras</span></div><PlayerControls />{modelError && <p className="error-box" role="alert">{modelError}</p>}</div><PerformanceTimeline /></div><ScriptEditor /></div>
    <footer className="app-footer"><span>RUANG CERITA</span><p>Dibuat untuk menjelaskan, menyampaikan, dan menginspirasi.</p><span>Script → Performance</span></footer>
  </main>;
}
