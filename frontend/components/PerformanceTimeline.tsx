'use client';
import { useAvatarStore } from '../stores/avatarStore';
import { formatTime } from './PlayerControls';
const emotions: Record<string, string> = { neutral: 'Netral', friendly: 'Ramah', happy: 'Senang', serious: 'Serius', thinking: 'Berpikir', excited: 'Antusias', concerned: 'Peduli' };
export function PerformanceTimeline() {
  const s = useAvatarStore();
  const timeline = s.timeline;
  const sentence = timeline?.sentences.find(item => s.currentTime >= item.start && s.currentTime < item.end);
  const word = timeline?.words.find(item => s.currentTime >= item.time && s.currentTime < item.time + item.duration);
  const lanes = timeline ? [
    { label: 'Ucapan', className: 'speech-lane', items: timeline.sentences.map(item => ({ start: item.start, end: item.end, label: item.text })) },
    { label: 'Gesture', className: 'gesture-lane', items: timeline.gestures.map(item => ({ start: item.start, end: item.start + item.duration, label: item.animation.replace('gesture_', '').replaceAll('_', ' ') })) },
    { label: 'Ekspresi', className: 'emotion-lane', items: timeline.emotion.map(item => ({ start: item.start, end: item.end, label: emotions[item.emotion] })) },
  ] : [];
  return <section className="timeline-panel" aria-labelledby="timeline-title">
    <div className="section-heading"><span className="step-number">03</span><h2 id="timeline-title">Alur performa</h2><span className="section-meta">{timeline ? `${timeline.sentences.length} bagian · ${timeline.gestures.length} gesture` : 'Menunggu naskah Anda'}</span></div>
    {timeline ? <>
      <div className="timeline-ruler"><span>0:00</span><span>{formatTime(timeline.duration / 2)}</span><span>{formatTime(timeline.duration)}</span></div>
      <div className="timeline-lanes">{lanes.map(lane => <div className="timeline-row" key={lane.label}><span>{lane.label}</span><div className={`lane ${lane.className}`}>{lane.items.map((item, index) => <button key={index} title={item.label} aria-label={`${lane.label}: ${item.label}, ${formatTime(item.start)}`} onClick={() => s.seek(item.start)} style={{ left: `${item.start / timeline.duration * 100}%`, width: `${(item.end - item.start) / timeline.duration * 100}%` }}>{lane.label === 'Ekspresi' ? item.label : ''}</button>)}<i className="playhead" style={{ left: `${Math.min(100, s.currentTime / timeline.duration * 100)}%` }} /></div></div>)}</div>
      <div className="caption"><span>SEDANG DIBACA</span><p>{sentence ? <>{word && word.char_index >= sentence.char_start && word.char_index < sentence.char_end ? <>{timeline.text.slice(sentence.char_start, word.char_index)}<mark>{timeline.text.slice(word.char_index, word.char_index + word.text.length)}</mark>{timeline.text.slice(word.char_index + word.text.length, sentence.char_end)}</> : sentence.text}</> : s.state === 'finished' ? 'Performa selesai. Putar kembali atau tulis cerita berikutnya.' : 'Tekan Play untuk menampilkan ucapan di sini.'}</p></div>
      <div className="artifact-links"><span>Gerakan bibir memakai perkiraan bunyi kata.</span><a href={s.audioUrl!} download>Unduh audio ↗</a><a href={s.timelineUrl!} download>Unduh timeline ↗</a></div>
      {timeline.warnings.map(warning => <p className="warning" key={warning}>{warning}</p>)}
    </> : <div className="timeline-empty"><div className="empty-lanes"><i /><i /><i /></div><p>Ucapan, gesture, dan ekspresi tersusun di sini<br/><span>setelah performa selesai dibuat.</span></p></div>}
  </section>;
}
