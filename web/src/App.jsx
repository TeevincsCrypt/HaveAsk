import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { AppCtx } from './context.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import MemberHome from './pages/member/MemberHome.jsx';
import NewRequest from './pages/member/NewRequest.jsx';
import MemberRequest from './pages/member/MemberRequest.jsx';
import VolunteerHome from './pages/volunteer/VolunteerHome.jsx';
import VolunteerAssignment from './pages/volunteer/VolunteerAssignment.jsx';
import VolunteerProfile from './pages/volunteer/VolunteerProfile.jsx';
import CareDashboard from './pages/care/CareDashboard.jsx';
import CareRequests from './pages/care/CareRequests.jsx';
import CareRequestDetail from './pages/care/CareRequestDetail.jsx';
import CareAlerts from './pages/care/CareAlerts.jsx';
import CareVolunteers from './pages/care/CareVolunteers.jsx';
import CareSettings from './pages/care/CareSettings.jsx';
import { Loading } from './components/ui.jsx';

export const homeFor = (role) => (role === 'member' ? '/member' : role === 'volunteer' ? '/volunteer' : '/care');

function Guard({ user, roles, children }) {
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const ok = roles.includes(user.role) || (roles.includes('coordinator') && user.role === 'admin');
  if (!ok) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [meta, setMeta] = useState(null);
  const [version, setVersion] = useState(0);

  const refreshMeta = useCallback(() => api('/meta').then((m) => setMeta({ ...m, fetchedAt: Date.now() })).catch(() => {}), []);
  const bump = useCallback(() => { setVersion((v) => v + 1); refreshMeta(); }, [refreshMeta]);

  useEffect(() => {
    api('/me').then((d) => setUser(d.user)).catch(() => setUser(null));
    refreshMeta();
  }, [refreshMeta]);

  // Keep dashboards fresh: the monitor runs server-side every minute.
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => setVersion((v) => v + 1), 60_000);
    return () => clearInterval(t);
  }, [user]);

  if (user === undefined || !meta) return <Loading />;
  const ctx = { user, setUser, meta, version, bump, now: meta.now + (Date.now() - meta.fetchedAt) };

  const wrap = (roles, el, narrow) => <Guard user={user} roles={roles}><Layout narrow={narrow}>{el}</Layout></Guard>;

  return (
    <AppCtx.Provider value={ctx}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <Login />} />
        <Route path="/" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />

        <Route path="/member" element={wrap(['member'], <MemberHome />, true)} />
        <Route path="/member/new" element={wrap(['member'], <NewRequest />, true)} />
        <Route path="/member/requests/:id" element={wrap(['member'], <MemberRequest />, true)} />

        <Route path="/volunteer" element={wrap(['volunteer'], <VolunteerHome />, true)} />
        <Route path="/volunteer/assignments/:id" element={wrap(['volunteer'], <VolunteerAssignment />, true)} />
        <Route path="/volunteer/profile" element={wrap(['volunteer'], <VolunteerProfile />, true)} />

        <Route path="/care" element={wrap(['coordinator'], <CareDashboard />)} />
        <Route path="/care/requests" element={wrap(['coordinator'], <CareRequests />)} />
        <Route path="/care/requests/:id" element={wrap(['coordinator'], <CareRequestDetail />)} />
        <Route path="/care/alerts" element={wrap(['coordinator'], <CareAlerts />)} />
        <Route path="/care/volunteers" element={wrap(['coordinator'], <CareVolunteers />)} />
        <Route path="/care/settings" element={wrap(['coordinator'], <CareSettings />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppCtx.Provider>
  );
}
