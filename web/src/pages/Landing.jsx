import { Link } from 'react-router-dom';
import { Icon } from '../components/ui.jsx';

const STARS = [[8, 14], [22, 30], [35, 9], [61, 20], [74, 12], [90, 26], [15, 48], [83, 44], [52, 6], [44, 36]];

export default function Landing() {
  return (
    <div className="landing">
      <header className="l-nav">
        <div className="l-nav-inner">
          <Link to="/" className="brand"><span className="brand-mark"><Icon name="heart" size={15} /></span>HaveAsk<sup>©</sup></Link>
          <nav className="l-nav-links">
            <a href="#how">How it works</a>
            <a href="#monitor">The monitor</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="l-nav-right">
            <Link to="/login" className="btn sm">Sign in</Link>
            <Link to="/login" className="round-btn" aria-label="Open the demo"><Icon name="arrow" /></Link>
          </div>
        </div>
      </header>

      {/* ---------------- hero ---------------- */}
      <section className="hero">
        {STARS.map(([x, y], i) => <span key={i} className="twinkle" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.45}s` }} />)}
        <div className="hero-words">
          <span className="hero-word l">Every</span>
          <div className="hero-object">
            <div className="lantern" aria-label="Preview of the HaveAsk care dashboard">
              <div className="spread tiny" style={{ marginBottom: 12, color: 'var(--text-2)' }}>
                <span className="row" style={{ gap: 6 }}><Icon name="heart" size={12} />Care monitor</span><span>Today</span>
              </div>
              <div className="mini">
                <b>🚗 Lift home from hospital</b>
                Friday · Riverside · walker needed
                <div className="row"><span className="badge ai"><Icon name="sparkle" size={11} />Suggested: Tom · 95%</span></div>
              </div>
              <div className="mini">
                <b>No update in 4 days</b>
                Weekly groceries for Frank
                <div className="row"><span className="badge warn"><span className="pip" />Check in with Daniel</span></div>
              </div>
              <div className="mini">
                <b>Request resolved</b>
                “Daniel was so kind and on time.”
                <div className="row"><span className="badge ok"><Icon name="check" size={11} />Help was useful</span></div>
              </div>
            </div>
            <Link to="/login" className="hero-cta">Try the<br />demo</Link>
          </div>
          <span className="hero-word r">answered</span>
          <span className="branch" aria-hidden />
        </div>

        <div className="moon">
          <span className="gem" aria-hidden />
          <h2>Church care, designed so no request quietly disappears</h2>
          <p>Private by default · AI suggests · people decide</p>
        </div>

        <div className="hero-badges">
          <div className="orb left">
            <span className="cap" style={{ color: 'var(--text)' }}>Made for church care teams</span>
            <span className="faces" aria-hidden><span>🙋</span><span>🤝</span><span>🕊️</span></span>
            <span className="tiny faint" style={{ marginTop: 8 }}>Members · Volunteers · Pastors</span>
          </div>
          <div className="orb right">
            <span className="big">7</span>
            <span className="cap">warning signs checked on every open request, every minute</span>
            <svg className="spark" viewBox="0 0 140 70" aria-hidden>
              <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#a9c4ff" stopOpacity=".5" /><stop offset="1" stopColor="#a9c4ff" stopOpacity="0" /></linearGradient></defs>
              <path d="M0 50 C 25 50, 30 20, 55 28 S 85 62, 105 40 S 130 24, 140 30 L140 70 L0 70Z" fill="url(#sg)" />
              <path d="M0 50 C 25 50, 30 20, 55 28 S 85 62, 105 40 S 130 24, 140 30" fill="none" stroke="#dbe6ff" strokeWidth="1.5" />
              <circle cx="55" cy="28" r="4" fill="#fff" />
            </svg>
          </div>
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="l-section" id="how">
        <span className="eyebrow">How it works</span>
        <h2 className="l-title">A quiet system for <em>faithful</em><br />follow-through.</h2>
        <p className="l-lead">Asking for help is hard. HaveAsk makes it private and simple for members, and makes sure the care team never loses track.</p>
        <div className="steps">
          <div className="step"><span className="num">01</span><h3>Ask privately</h3><p>A member describes what they need, how urgent it is and how to reach them. Only the care team can see it.</p></div>
          <div className="step"><span className="num">02</span><h3>AI sorts & suggests</h3><p>The request is categorized, urgency signals are surfaced, and 2–3 well-suited volunteers are proposed with reasons.</p><div className="tag"><span className="badge ai"><Icon name="sparkle" size={11} />Suggestions only</span></div></div>
          <div className="step"><span className="num">03</span><h3>A person approves</h3><p>The coordinator chooses who helps and what they see. Volunteers accept or decline, then post simple updates.</p></div>
          <div className="step"><span className="num">04</span><h3>Nothing slips</h3><p>If a request goes quiet, the coordinator is alerted with a clear next step, and volunteers get a gentle reminder.</p></div>
        </div>
      </section>

      {/* ---------------- monitor ---------------- */}
      <section className="l-section" id="monitor">
        <div className="watch">
          <div>
            <span className="eyebrow">The care monitor</span>
            <h2 className="l-title">It notices when<br />a request <em>goes quiet.</em></h2>
            <p className="l-lead">Every open request is checked continuously for signs it might be forgotten, and the right person hears about it.</p>
            <div className="watch-list">
              <div><i className="c" />High-urgency need with no volunteer yet</div>
              <div><i />Volunteer accepted, but no update for days</div>
              <div><i />The person who asked hasn’t heard from anyone</div>
              <div><i />A volunteer says they need more support</div>
              <div><i className="c" />Language that suggests someone may be at risk</div>
            </div>
          </div>
          <div className="watch-demo">
            <span className="ring" aria-hidden /><span className="ring two" aria-hidden />
            <div className="card alert-panel">
              <div className="card-head"><h2 className="row" style={{ gap: 8, color: 'var(--crit)' }}><Icon name="alert" size={17} />Needs attention</h2><span className="tiny faint">Example</span></div>
              {[
                ['critical', 'High urgency, no volunteer', 'Food request has waited 19 hours with no volunteer assigned.', 'Review AI-suggested matches and assign today'],
                ['warning', 'No progress update from volunteer', 'Daniel accepted 6 days ago and hasn’t posted progress since.', 'Check in with Daniel'],
                ['warning', 'Member hasn’t heard from anyone', 'James asked for help 7 days ago. No contact recorded.', 'Contact James to let them know they’ve been heard'],
              ].map(([sev, t, s, a]) => (
                <div key={t} className={`alert-item ${sev}`} style={{ gridTemplateColumns: '3px minmax(0,1fr)' }}>
                  <span className="bar" />
                  <div>
                    <div className="alert-title">{sev === 'critical' ? <span className="badge crit">Urgent</span> : <span className="badge warn">Needs attention</span>}{t}</div>
                    <div className="alert-sum">{s}</div>
                    <div className="next-step"><Icon name="arrow" size={13} />Recommended: {a}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- roles ---------------- */}
      <section className="l-section">
        <span className="eyebrow">For everyone involved</span>
        <h2 className="l-title">One network,<br /><em>three</em> kinds of care.</h2>
        <div className="roles">
          <div className="role"><span className="ri">🙋</span><h3>Members</h3><p>Ask for help without the whole church knowing.</p>
            <ul><li>Simple, private request form</li><li>See status: pending → resolved</li><li>One optional “was it useful?” check-in</li></ul></div>
          <div className="role"><span className="ri">🤝</span><h3>Volunteers</h3><p>Clear, need-to-know assignments, never overloaded.</p>
            <ul><li>Accept or decline in one tap</li><li>Contact details only after accepting</li><li>Quick updates from your phone</li></ul></div>
          <div className="role"><span className="ri">🕊️</span><h3>Pastors & coordinators</h3><p>See everything in one calm place.</p>
            <ul><li>New, aging and urgent requests</li><li>AI matches you approve or dismiss</li><li>Alerts with a recommended next step</li></ul></div>
        </div>
      </section>

      {/* ---------------- promise ---------------- */}
      <section className="promise" id="privacy">
        <span className="eyebrow">Responsible by design</span>
        <h2 className="l-title">AI helps surface needs.<br /><em>Humans</em> make every care decision.</h2>
        <div className="promise-grid">
          <div><Icon name="lock" size={20} /><b>Private by default</b>Only the coordinator and the assigned volunteer see a request.</div>
          <div><Icon name="sparkle" size={20} /><b>Suggestions, labelled</b>Every AI output is clearly marked as a suggestion.</div>
          <div><Icon name="users" size={20} /><b>People assign</b>AI never assigns a volunteer without human approval.</div>
          <div><Icon name="shield" size={20} /><b>No AI outreach</b>AI never contacts the person asking for help.</div>
        </div>
      </section>

      <section className="cta-band">
        <h2 className="l-title">Let no ask go<br /><em>unanswered.</em></h2>
        <p className="l-lead" style={{ margin: '18px auto 0' }}>Explore the full prototype with demo accounts for a member, a volunteer and a care coordinator.</p>
        <div className="row">
          <Link to="/login" className="btn primary lg">Try the live demo <Icon name="arrow" /></Link>
          <a href="#how" className="btn lg">How it works</a>
        </div>
      </section>

      <footer className="l-footer">
        <span>HaveAsk — AI Church Care Network · Prototype with synthetic demo data</span>
        <span>AI helps surface needs and suggestions. Humans make all care decisions.</span>
      </footer>
    </div>
  );
}
