'use client';
import { EXPRESSIONS, type ExpressionId } from '../expressions';
import { useAvatarStore } from '../stores/avatarStore';

export function ExpressionControls() {
  const expression = useAvatarStore(s => s.expression);
  const intensity = useAvatarStore(s => s.expressionIntensity);
  const automatic = expression === 'auto';
  return <section className="expression-panel" aria-labelledby="expression-title">
    <div className="section-heading"><h2 id="expression-title">Ekspresi karakter</h2><span className="section-meta">Langsung terlihat di preview</span></div>
    <div className="expression-options" role="group" aria-label="Pilih ekspresi">
      {Object.entries(EXPRESSIONS).map(([id, label]) => <button key={id} type="button" aria-pressed={expression === id}
        onClick={() => useAvatarStore.getState().setExpression(id as ExpressionId)}>{label}</button>)}
    </div>
    <div className="expression-strength"><label htmlFor="expression-intensity">Kekuatan ekspresi</label>
      <input id="expression-intensity" type="range" min="0" max="100" step="5" disabled={automatic}
        value={Math.round(intensity * 100)} aria-valuetext={`${Math.round(intensity * 100)} persen`}
        onChange={event => useAvatarStore.getState().setExpressionIntensity(Number(event.target.value) / 100)} />
      <output htmlFor="expression-intensity">{Math.round(intensity * 100)}%</output>
    </div>
    <p className="expression-note">{automatic ? 'Ekspresi mengikuti emosi naskah saat diputar.' : `${EXPRESSIONS[expression]} aktif sampai Anda memilih ekspresi lain atau Otomatis.`} Pilihan ini mengatur wajah; suara tetap mengikuti naskah.</p>
  </section>;
}
