import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../api.js';
import { useApp } from '../context.js';
import { homeFor } from '../App.jsx';
import { Icon } from '../components/ui.jsx';

export default function Welcome() {
  const { user, meta, setUser } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ name: !user.name || user.name === user.email?.split('@')[0] ? '' : user.name, area: '', phone: '', intent: 'help' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const d = await post('/me/onboard', f); setUser(d.user); nav(homeFor(d.user.role), { replace: true }); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="auth-main" style={{ minHeight: '100vh' }}>
      <form className="auth-card card stack" style={{ gap: 20, width: 'min(520px, 100%)' }} onSubmit={save}>
        <div>
          <span className="eyebrow">Welcome to HaveAsk</span>
          <h1 style={{ marginTop: 12 }}>Let’s get you set up</h1>
          <p className="muted" style={{ marginTop: 6 }}>Just a few details so the care team knows who you are.</p>
        </div>
        <div className="field"><label htmlFor="n">Your name</label><input id="n" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus required /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="a">Neighbourhood <span className="faint">(optional)</span></label>
            <select id="a" className="select" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
              <option value="">Prefer not to say</option>{meta.areas.map((a) => <option key={a}>{a}</option>)}
            </select></div>
          <div className="field"><label htmlFor="p">Phone <span className="faint">(optional)</span></label><input id="p" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        </div>
        {user.role === 'member' && (
          <div className="field">
            <span className="label">I’m here to…</span>
            <div className="choice-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className={`choice ${f.intent === 'help' ? 'on' : ''}`} onClick={() => setF({ ...f, intent: 'help' })}><span className="ico">🙋</span><b>Ask for help</b><span>Privately request support</span></button>
              <button type="button" className={`choice ${f.intent === 'volunteer' ? 'on' : ''}`} onClick={() => setF({ ...f, intent: 'volunteer' })}><span className="ico">🤝</span><b>Volunteer</b><span>A coordinator will confirm you</span></button>
            </div>
          </div>
        )}
        <div className="privacy-box"><Icon name="wallet" size={18} /><span>{user.wallet_address ? <>Your wallet is ready: <span className="mono">{user.wallet_address.slice(0, 6)}…{user.wallet_address.slice(-4)}</span></> : 'Your wallet is being created…'}</span></div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary lg block" disabled={busy}>Continue</button>
      </form>
    </div>
  );
}
