'use client';
import { useAvatarStore } from '../stores/avatarStore';
import type { SpeechStyle } from '../types/performance';
const stages = ['Menganalisis naskah', 'Membuat suara', 'Menyusun animasi', 'Memuat audio'];
export function ScriptEditor() {
  const s = useAvatarStore();
  const busy = s.state === 'generating';
  const stageIndex = stages.findIndex(stage => s.stage.startsWith(stage));
  return <section className="script-panel" aria-labelledby="script-title">
    <div className="section-heading"><span className="step-number">01</span><h2 id="script-title">Siapkan cerita Anda</h2></div>
    <p className="section-description">Tulis seperti Anda berbicara. Karakter akan membawakan setiap gagasannya.</p>
    <div className="editor-label"><label htmlFor="script">Naskah presenter</label><span>{s.text.length.toLocaleString('id-ID')} / 5.000</span></div>
    <textarea id="script" value={s.text} onChange={e => s.setText(e.target.value)} disabled={busy} maxLength={5000} placeholder="Selamat datang. Hari ini kita akan membahas…" spellCheck={false} />
    <div className="editor-tip"><span>↳</span> Gunakan tanda baca dan paragraf untuk membagi gagasan.</div>
    <div className="voice-settings">
      <div><label htmlFor="voice">Suara</label><select id="voice" disabled={busy} defaultValue="id-ID-ArdiNeural"><option value="id-ID-ArdiNeural">Ardi · Bahasa Indonesia</option></select></div>
      <div><label htmlFor="speech-style">Gaya bicara</label><select id="speech-style" value={s.speechStyle} disabled={busy} onChange={e => s.setSpeechStyle(e.target.value as SpeechStyle)}><option value="conversational">Ngobrol</option><option value="relaxed">Santai</option><option value="normal">Normal</option></select>
        <p className="speech-style-note">{s.speechStyle === 'conversational' ? 'Tempo mendekati bicara biasa, dengan variasi nada ringan antarbagian kalimat.' : s.speechStyle === 'relaxed' ? 'Tempo lebih pelan dan nada sedikit lebih rendah.' : 'Nada asli Ardi dengan tempo presenter biasa.'}</p>
      </div>
      <div className="rate-field"><label htmlFor="rate">Tempo <output>{s.rate.toFixed(2)}×</output></label><input id="rate" type="range" min="0.6" max="1.3" step="0.05" value={s.rate} disabled={busy} onChange={e => s.setRate(Number(e.target.value))} /></div>
    </div>
    <p className="privacy-note">Suara AI diproses secara online. Naskah dikirim ke layanan suara Microsoft saat Anda menekan Generate.</p>
    <button className="primary generate" disabled={busy || !s.text.trim()} onClick={() => void s.generate()}>{busy ? <><span className="spinner" /> Membuat performa…</> : <><span aria-hidden>✧</span> Generate Performance <span aria-hidden>↗</span></>}</button>
    {busy && <div className="generation" aria-live="polite"><ol>{stages.map((stage, index) => <li key={stage} className={index < stageIndex ? 'done' : index === stageIndex ? 'current' : ''}><span>{index < stageIndex ? '✓' : index + 1}</span>{stage}</li>)}</ol><button className="text-button" onClick={s.cancel}>Batalkan proses</button></div>}
    {s.error && <p className="error-box" role="alert">{s.error}</p>}
    {!busy && <p className="generation-status" role="status">{s.stage}</p>}
    <div className="script-bottom"><span className="tiny-dot" /> Satu naskah. Satu performa yang utuh.</div>
  </section>;
}
