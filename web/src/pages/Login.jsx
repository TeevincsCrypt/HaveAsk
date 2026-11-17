import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { post } from '../api.js';
import { useApp } from '../context.js';
import { homeFor } from '../App.jsx';
import { Icon, ResponsibleAINote } from '../components/ui.jsx';
import { initials } from '../format.js';

const DEMO = [
  { email: 'care@haveask.demo', name: 'Pastor Miriam Hale', role: 'Care Coordinator', hint: 'Start here — dashboard, AI matches & alerts' },
  { email: 'member@haveask.demo', name: 'Sarah Thompson', role: 'Member', hint: 'Submit a private request for help' },
  { email: 'volunteer@haveask.demo', name: 'Grace Liu', role: 'Volunteer', hint: 'Receive and update assignments' },
  { email: 'pastor@haveask.demo', name: 'Rev. Samuel Osei', role: 'Pastor · Admin', hint: 'Receives escalations' },
];

export default function Login() {
  const { setUser, bump } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const done = (user) => { setUser(user); bump(); nav(loc.state?.from && loc.state.from !== '/' ? loc.state.from : homeFor(user.role), { replace: true }); };

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = mode === 'login' ? await post('/auth/login', form) : await post('/auth/signup', form);
      done(d.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const quick = async (email) => {
    setBusy(true); setError(null);
    try { done((await post('/auth/login', { email, password: 'demo1234' })).user); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <span className="brand-mark" style={{ background: 'rgba(255,255,255,0.15)' }}><Icon name="heart" size={17} style={{ color: 'white' }} /></span>
            <b style={{ color: 'white', fontSize: 17 }}>HaveAsk</b>
          </div>
          <h1>No request for help should quietly disappear.</h1>
          <p>A private, caring way for church members to ask for practical help — and for your care team to make sure every request is followed through.</p>
          <div className="auth-points">
            <div><span className="i"><Icon name="lock" /></span><span><b>Private by default</b>Only the care coordinator and the assigned volunteer ever see a request.</span></div>
            <div><span className="i"><Icon name="sparkle" /></span><span><b>AI suggests, people decide</b>AI sorts requests and proposes matches. A coordinator approves every one.</span></div>
            <div><span className="i"><Icon name="bell" /></span><span><b>Nothing slips through</b>Requests at risk of being forgotten are flagged with a clear next step.</span></div>
          </div>
        </div>
        <p className="small" style={{ color: '#a9cbc5' }}>
          <ResponsibleAINote compact />
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card stack">
          <div>
            <h1 style={{ fontSize: 26 }}>{mode === 'login' ? 'Welcome back' : 'Create a member account'}</h1>
            <p className="muted" style={{ marginTop: 4 }}>{mode === 'login' ? 'Sign in to HaveAsk.' : 'So you can privately ask for help and see updates.'}</p>
          </div>

          <form className="stack" onSubmit={submit}>
            {mode === 'signup' && (
              <div className="field"><label htmlFor="name">Your name</label>
                <input id="name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required /></div>
            )}
            <div className="field"><label htmlFor="email">Email</label>
              <input id="email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required /></div>
            <div className="field"><label htmlFor="pw">Password</label>
              <input id="pw" type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : undefined} /></div>
            {error && <div className="error">{error}</div>}
            <button className="btn primary lg block" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
            <button type="button" className="btn ghost sm" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}>
              {mode === 'login' ? 'New here? Create a member account' : 'Already have an account? Sign in'}
            </button>
          </form>

          <div className="divider" />
          <div className="stack-sm">
            <div className="spread"><h3>Demo accounts</h3><span className="tiny faint">password: demo1234</span></div>
            <div className="demo-accounts">
              {DEMO.map((d) => (
                <button key={d.email} className="demo-acc" onClick={() => quick(d.email)} disabled={busy}>
                  <span className="avatar">{initials(d.name)}</span>
                  <span style={{ flex: 1 }}><b>{d.name} <span className="badge neutral" style={{ marginLeft: 4 }}>{d.role}</span></b><span>{d.hint}</span></span>
                  <Icon name="arrow" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
