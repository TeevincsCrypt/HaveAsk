import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../../api.js';
import { useApp } from '../../context.js';
import { CAT_ICON, Icon } from '../../components/ui.jsx';

const CAT_HINT = {
  food: 'Groceries, meals', accommodation: 'Housing, a place to stay', medical: 'Appointments, prescriptions',
  transportation: 'Lifts and rides', emotional: 'Someone to talk or pray with', financial: 'Bills, budgeting',
  childcare: 'Looking after children', other: 'Anything else',
};
const URGENCY = [
  ['low', 'Low', 'Within the next couple of weeks'],
  ['medium', 'Medium', 'In the next few days'],
  ['high', 'High', 'Today or tomorrow'],
];

export default function NewRequest() {
  const { meta, user, bump } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ category: '', description: '', urgency: '', contact_method: 'phone', contact_detail: '', followup_availability: '', area: user.area || '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = await post('/my/requests', f);
      setDone(d.request); bump();
      window.scrollTo(0, 0);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="card hero-confirm">
        <div className="check"><Icon name="check" size={28} stroke={2.5} /></div>
        <h1>Thank you — your request has been received</h1>
        <p className="muted" style={{ maxWidth: 520, margin: '10px auto 0' }}>
          It has been shared privately with our care coordinator, who will review it and find the right person to help.
          {done.urgency === 'high' ? ' Because you marked it as urgent, it has been flagged for prompt attention.' : ''}
          {' '}We’ll be in touch by <b>{meta.contactMethods[done.contact_method].toLowerCase()}</b>.
        </p>
        <div className="privacy-box" style={{ maxWidth: 520, margin: '20px auto 0', textAlign: 'left' }}>
          <Icon name="lock" size={18} />
          <span>Nobody else in the church can see this request. You can check its status here at any time.</span>
        </div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
          <Link to={`/member/requests/${done.id}`} className="btn primary">View request status</Link>
          <Link to="/member" className="btn">Back to my requests</Link>
        </div>
      </div>
    );
  }

  return (
    <form className="stack" style={{ gap: 22 }} onSubmit={submit}>
      <div>
        <div className="crumbs"><Link to="/member">My requests</Link> / Ask for help</div>
        <h1>Ask for help</h1>
        <p className="muted" style={{ marginTop: 4 }}>Tell us a little about what you need. There’s no such thing as too small a request.</p>
      </div>

      <div className="privacy-box"><Icon name="lock" size={18} /><span><b>Private.</b> Only the care coordinator and the volunteer who helps you will see this.</span></div>

      <div className="card card-pad stack" style={{ gap: 22 }}>
        <div className="field">
          <span className="label">What kind of help do you need?</span>
          <div className="choice-grid" role="radiogroup">
            {Object.entries(meta.categories).map(([k, label]) => (
              <button type="button" key={k} role="radio" aria-checked={f.category === k} className={`choice ${f.category === k ? 'on' : ''}`} onClick={() => set('category')(k)}>
                <span className="ico" aria-hidden>{CAT_ICON[k]}</span><b>{label}</b><span>{CAT_HINT[k]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="desc">Briefly describe what you need</label>
          <textarea id="desc" className="textarea" value={f.description} onChange={set('description')} maxLength={2000}
            placeholder="For example: I’ve just come out of hospital and need help getting groceries for the next two weeks." />
          <span className="hint">Share only what you’re comfortable with. {f.description.length}/2000</span>
        </div>

        <div className="field">
          <span className="label">How urgent is this?</span>
          <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }} role="radiogroup">
            {URGENCY.map(([k, l, h]) => (
              <button type="button" key={k} role="radio" aria-checked={f.urgency === k} className={`choice ${f.urgency === k ? 'on' : ''}`} onClick={() => set('urgency')(k)}>
                <b>{l}</b><span>{h}</span>
              </button>
            ))}
          </div>
          <span className="hint">If anyone is in immediate danger, please call emergency services first.</span>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="cm">How should we contact you?</label>
            <select id="cm" className="select" value={f.contact_method} onChange={set('contact_method')}>
              {Object.entries(meta.contactMethods).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cd">{f.contact_method === 'email' ? 'Email address' : f.contact_method === 'in_person' ? 'Where can we find you?' : 'Phone number'} <span className="faint">(optional)</span></label>
            <input id="cd" className="input" value={f.contact_detail} onChange={set('contact_detail')} placeholder={f.contact_method === 'email' ? user.email : f.contact_method === 'in_person' ? 'e.g. after the 10am service' : 'Uses the number on your profile if blank'} />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="fa">When are you available for a follow-up? <span className="faint">(optional)</span></label>
            <input id="fa" className="input" value={f.followup_availability} onChange={set('followup_availability')} placeholder="e.g. weekday evenings after 6pm" />
          </div>
          <div className="field">
            <label htmlFor="ar">Your neighbourhood <span className="faint">(helps find someone nearby)</span></label>
            <select id="ar" className="select" value={f.area} onChange={set('area')}>
              <option value="">Prefer not to say</option>
              {meta.areas.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        <div className="spread">
          <span className="small muted" style={{ maxWidth: 440 }}>
            AI may help our coordinator sort your request and suggest who could help. A person reviews everything — AI will never contact you.
          </span>
          <button className="btn primary lg" disabled={busy || !f.category || !f.urgency || f.description.trim().length < 10}>
            {busy ? 'Sending privately…' : 'Send request privately'}
          </button>
        </div>
      </div>
    </form>
  );
}
