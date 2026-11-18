import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../api.js';
import { useApp } from '../context.js';
import { useAuthWallet } from '../wallet.jsx';
import { Icon, ResponsibleAINote } from '../components/ui.jsx';

export default function Login() {
  const { meta, setUser, bump } = useApp();
  const wallet = useAuthWallet();
  const nav = useNavigate();
  const [devEmail, setDevEmail] = useState('');
  const [error, setError] = useState(null);
  const signingIn = wallet.available && wallet.ready && wallet.authenticated;

  const devLogin = async (e) => {
    e.preventDefault(); setError(null);
    try { const d = await post('/auth/dev', { email: devEmail }); setUser(d.user); bump(); nav('/'); } catch (err) { setError(err.message); }
  };

  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <div>
          <Link to="/" className="brand"><span className="brand-mark"><Icon name="heart" size={15} /></span>HaveAsk<sup>©</sup></Link>
          <h1>No ask should quietly <em>disappear.</em></h1>
          <p>A private, caring way for church members to ask for practical help, and for your care team to make sure every request is followed through.</p>
          <div className="auth-points">
            <div><span className="i"><Icon name="lock" /></span><span><b>Private by default</b>Only the care coordinator and the assigned volunteer ever see a request.</span></div>
            <div><span className="i"><Icon name="wallet" /></span><span><b>Your own wallet, automatically</b>Financial help and volunteer reimbursements are paid straight to it in USDC.</span></div>
            <div><span className="i"><Icon name="sparkle" /></span><span><b>AI suggests, people decide</b>A coordinator approves every match, and every payment.</span></div>
          </div>
        </div>
        <p className="small muted"><ResponsibleAINote compact /></p>
      </aside>

      <main className="auth-main">
        <div className="auth-card card stack" style={{ gap: 22 }}>
          <div>
            <h1>Welcome</h1>
            <p className="muted" style={{ marginTop: 6 }}>Sign in or create an account with your email or Google. New here? The same button creates your account.</p>
          </div>

          {meta.privyAppId ? (
            <button className="btn primary lg block" disabled={!wallet.ready || signingIn} onClick={() => wallet.login()}>
              {signingIn ? 'Signing you in…' : !wallet.ready ? 'Loading…' : <>Continue with email or Google <Icon name="arrow" /></>}
            </button>
          ) : !meta.devLogin && (
            <div className="error">Sign-in isn’t set up on this server yet. An administrator needs to add the Privy app ID and secret.</div>
          )}

          <div className="privacy-box">
            <Icon name="wallet" size={18} />
            <span>When you sign in, a secure wallet is created for you on {meta.chain.name}. You don’t need any crypto experience — it’s simply where the care team can send help.</span>
          </div>

          {meta.devLogin && (
            <form className="stack-sm" onSubmit={devLogin} style={{ borderTop: '1px dashed var(--border-strong)', paddingTop: 16 }}>
              <span className="label">Developer sign-in <span className="badge warn">local only</span></span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" type="email" placeholder="care@haveask.demo" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} />
                <button className="btn">Sign in</button>
              </div>
              <span className="tiny faint">Enabled by HAVEASK_DEV_LOGIN. No wallet is created, so payments can’t be signed.</span>
            </form>
          )}
          {error && <div className="error">{error}</div>}
          <p className="tiny faint">By continuing you agree that HaveAsk stores your name and contact details so the care team can help you.</p>
        </div>
      </main>
    </div>
  );
}
