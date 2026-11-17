import { useEffect, useState } from 'react';
import { put } from '../../api.js';
import { useApp, useData } from '../../context.js';
import { CAT_ICON, Loading, LoadMeter, useToast } from '../../components/ui.jsx';

const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export default function VolunteerProfile() {
  const { meta } = useApp();
  const toast = useToast();
  const { data } = useData('/vol/profile');
  const [p, setP] = useState(null);
  useEffect(() => { if (data) setP(data.profile); }, [data]);
  if (!p) return <Loading />;
  const toggle = (k, v) => setP({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] });
  const save = async () => { try { await put('/vol/profile', p); toast('Profile saved. Thank you!'); } catch (e) { toast(e.message); } };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div><h1>My volunteer profile</h1><p className="muted" style={{ marginTop: 4 }}>This helps the coordinator (and the AI suggestions) match you with requests that fit your gifts and time.</p></div>
      <div className="card card-pad stack" style={{ gap: 22 }}>
        <div className="field">
          <span className="label">How can you help?</span>
          <div className="checks">
            {Object.entries(meta.categories).map(([k, l]) => (
              <label key={k} className={`check-pill ${p.skills.includes(k) ? 'on' : ''}`}><input type="checkbox" checked={p.skills.includes(k)} onChange={() => toggle('skills', k)} />{CAT_ICON[k]} {l}</label>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Which days are you usually free?</span>
          <div className="checks">
            {meta.days.map((d) => (
              <label key={d} className={`check-pill ${p.availability_days.includes(d) ? 'on' : ''}`}><input type="checkbox" checked={p.availability_days.includes(d)} onChange={() => toggle('availability_days', d)} />{DAY_LABEL[d]}</label>
            ))}
          </div>
        </div>
        <div className="grid-2">
          <div className="field"><label htmlFor="an">Availability notes</label><input id="an" className="input" value={p.availability_note || ''} onChange={(e) => setP({ ...p, availability_note: e.target.value })} placeholder="e.g. Evenings; short notice OK" /></div>
          <div className="field"><label htmlFor="ar">Neighbourhood</label>
            <select id="ar" className="select" value={p.area || ''} onChange={(e) => setP({ ...p, area: e.target.value })}>{meta.areas.map((a) => <option key={a}>{a}</option>)}</select></div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="ml">Most assignments at once</label>
            <select id="ml" className="select" value={p.max_load} onChange={(e) => setP({ ...p, max_load: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? 'Taking a break (0)' : n}</option>)}
            </select>
            <span className="hint row" style={{ gap: 8 }}>Currently {p.load} active <LoadMeter load={p.load} max={p.max_load} /></span>
          </div>
          <div className="field">
            <span className="label">Transport</span>
            <label className={`check-pill ${p.has_vehicle ? 'on' : ''}`} style={{ alignSelf: 'flex-start' }}><input type="checkbox" checked={!!p.has_vehicle} onChange={(e) => setP({ ...p, has_vehicle: e.target.checked })} />🚗 I have a car</label>
          </div>
        </div>
        <div className="field"><label htmlFor="bio">About you</label><textarea id="bio" className="textarea" style={{ minHeight: 70 }} value={p.bio || ''} onChange={(e) => setP({ ...p, bio: e.target.value })} /></div>
        <div><button className="btn primary" onClick={save}>Save profile</button></div>
      </div>
    </div>
  );
}
