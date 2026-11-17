import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api, post } from '../api.js';
import { useApp } from '../context.js';
import { relTime, initials, fmtDate } from '../format.js';
import { Icon, ResponsibleAINote, useToast } from './ui.jsx';

const ROLE_LABEL = { member: 'Member', volunteer: 'Volunteer', coordinator: 'Care Coordinator', admin: 'Pastor · Admin' };

function useOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOut();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

function Bell() {
  const { version, now } = useApp();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  const load = () => api('/notifications').then(setData).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [version]);
  const click = async (n) => {
    setOpen(false);
    if (!n.read) await post(`/notifications/${n.id}/read`).catch(() => {});
    load();
    if (n.link) nav(n.link);
  };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications (${data.unread} unread)`}>
        <Icon name="bell" size={18} />
        {data.unread > 0 && <span className="dot">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          <div className="spread" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3>Notifications</h3>
            {data.unread > 0 && <button className="btn ghost sm" onClick={() => post('/notifications/read-all').then(load)}>Mark all read</button>}
          </div>
          {data.items.length === 0 && <div className="empty small">You’re all caught up.</div>}
          {data.items.map((n) => (
            <a key={n.id} className={`notif ${n.read ? '' : 'unread'}`} href={n.link || '#'} onClick={(e) => { e.preventDefault(); click(n); }}>
              <b>{n.title}</b>
              {n.body && <p>{n.body}</p>}
              <div className="tiny faint" style={{ marginTop: 4 }}>{relTime(n.created_at, now)}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, setUser } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  const logout = async () => { await post('/auth/logout'); setUser(null); nav('/login'); };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="user-chip" onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{initials(user.name)}</span>
        <span className="meta"><b>{user.name}</b><span>{ROLE_LABEL[user.role]}</span></span>
      </button>
      {open && (
        <div className="menu-pop">
          <div style={{ padding: '6px 10px 8px' }} className="small muted">{user.email}</div>
          {user.role === 'volunteer' && <Link to="/volunteer/profile" onClick={() => setOpen(false)}>My volunteer profile</Link>}
          <button onClick={logout}><span className="row" style={{ gap: 8 }}><Icon name="logout" />Sign out</span></button>
        </div>
      )}
    </div>
  );
}

function DemoBanner() {
  const { meta, user, bump, now } = useApp();
  const toast = useToast();
  if (!meta.clockOffsetMs) return null;
  const isCare = user.role === 'coordinator' || user.role === 'admin';
  const days = Math.round((meta.clockOffsetMs / 86_400_000) * 10) / 10;
  return (
    <div className="demo-banner">
      <div className="demo-banner-inner">
        <Icon name="clock" size={14} />
        <span>Demo clock: <b>{fmtDate(now)}</b> ({days} day{days === 1 ? '' : 's'} fast-forwarded)</span>
        {isCare && <button onClick={() => post('/care/demo/advance', { days: 1 }).then((r) => { bump(); toast(`Fast-forwarded 1 day — monitor raised ${r.stats.created} new alert(s).`); })}>+1 day</button>}
      </div>
    </div>
  );
}

export default function Layout({ children, narrow }) {
  const { user, version } = useApp();
  const isCare = user.role === 'coordinator' || user.role === 'admin';
  const [alertCount, setAlertCount] = useState(0);
  useEffect(() => {
    if (isCare) api('/care/alerts').then((d) => setAlertCount(d.alerts.filter((a) => a.status === 'open').length)).catch(() => {});
  }, [isCare, version]);

  const links = isCare
    ? [['/care', 'Dashboard', true], ['/care/alerts', <>Alerts{alertCount > 0 && <span className="count">{alertCount}</span>}</>], ['/care/requests', 'Requests'], ['/care/volunteers', 'Volunteers'], ['/care/settings', 'Settings & demo']]
    : user.role === 'volunteer'
      ? [['/volunteer', 'My assignments', true], ['/volunteer/profile', 'My profile']]
      : [['/member', 'My requests', true], ['/member/new', 'Ask for help']];

  return (
    <div className="app">
      <DemoBanner />
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark"><Icon name="heart" size={17} stroke={2.2} style={{ color: 'white' }} /></span>
            <span>HaveAsk<small>Church Care Network</small></span>
          </Link>
          <nav className="nav">
            {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
          </nav>
          <div className="top-actions">
            <Bell />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className={`main ${narrow ? 'narrow' : ''}`}>{children}</main>
      <footer className="footer">
        <div className="footer-inner">
          <ResponsibleAINote />
          <span className="faint">Prototype · synthetic demo data only</span>
        </div>
      </footer>
    </div>
  );
}
