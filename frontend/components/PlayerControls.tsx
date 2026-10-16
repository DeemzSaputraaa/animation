'use client';
import { useAvatarStore } from '../stores/avatarStore';
export const formatTime = (time: number) => `${Math.floor((time || 0) / 60)}:${String(Math.floor((time || 0) % 60)).padStart(2, '0')}`;
export function PlayerControls() {
  const s = useAvatarStore();
  const ready = !!s.timeline && s.modelReady && s.state !== 'generating';
  return <div className="player-controls">
    <div className="transport"><button className="play-button" onClick={() => void s.play()} disabled={!ready || s.state === 'playing'} aria-label={s.state === 'paused' ? 'Lanjutkan pemutaran' : 'Play'}><span aria-hidden>▶</span> {s.state === 'paused' ? 'Lanjutkan' : s.state === 'finished' ? 'Putar ulang' : 'Play'}</button><button onClick={s.pause} disabled={s.state !== 'playing'} aria-label="Pause">Ⅱ</button><button onClick={s.stop} disabled={!['playing', 'paused', 'finished'].includes(s.state)} aria-label="Stop">■</button></div>
    <label className="seek"><span className="sr-only">Posisi pemutaran</span><input type="range" min="0" max={s.duration || 1} step="0.01" value={Math.min(s.currentTime, s.duration || 1)} onChange={e => s.seek(Number(e.target.value))} disabled={!ready} aria-valuetext={`${formatTime(s.currentTime)} dari ${formatTime(s.duration)}`} /></label>
    <div className="timecode">{formatTime(s.currentTime)} <span>/ {formatTime(s.duration)}</span></div>
  </div>;
}
