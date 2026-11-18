import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, post } from './api.js';
import { AppCtx } from './context.js';
import { useAuthWallet } from './wallet.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Landing from './pages/Landing.jsx';
import Welcome from './pages/Welcome.jsx';
import Wallet from './pages/Wallet.jsx';
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
import CarePayments from './pages/care/CarePayments.jsx';
import CarePeople from './pages/care/CarePeople.jsx';
import { Loading } from './components/ui.jsx';

export const homeFor = (role) => (role === 'member' ? '/member' : role === 'volunteer' ? '/volunteer' : '/care');

function Guard({ user, roles, children }) {
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!user.onboarded) return <Navigate to="/welcome" replace />;
  if (roles) {
    const ok = roles.includes(user.role) || (roles.includes('coordinator') && user.role === 'admin');
    if (!ok) return <Navigate to={homeFor(user.role)} replace />;
  }
  return children;
}

export default function App({ initialMeta }) {
  const wallet = useAuthWallet();
  const [user, setUser] = useState(undefined);
  const [meta, setMeta] = useState(initialMeta);
  const [version, setVersion] = useState(0);
  const exchanging = useRef(false);

  const refreshMeta = useCallback(() => api('/meta').then((m) => setMeta({ ...m, fetchedAt: Date.now() })).catch(() => {}), []);
  const bump = useCallback(() => { setVersion((v) => v + 1); refreshMeta(); }, [refreshMeta]);

  useEffect(() => { api('/me').then((d) => setUser(d.user)).catch(() => setUser(null)); }, []);

  // Privy is signed in but we have no server session yet: exchange the Privy access token for one.
  useEffect(() => {
    if (user !== null || !wallet.available || !wallet.ready || !wallet.authenticated || exchanging.current) return;
    exchanging.current = true;
    (async () => {
      try {
        const token = await wallet.getAccessToken();
        const d = await post('/auth/privy', { access_token: token });
        setUser(d.user); bump();
      } catch (e) {
        console.warn('Sign-in exchange failed', e);
        await wallet.logout().catch(() => {});
      } finally { exchanging.current = false; }
    })();
  }, [user, wallet.available, wallet.ready, wallet.authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // The embedded wallet is created just after first sign-in; ask the server to pick it up from Privy.
  useEffect(() => {
    if (user && !user.wallet_address && wallet.embeddedAddress) {
      post('/me/wallet/sync').then((d) => setUser(d.user)).catch(() => {});
    }
  }, [user, wallet.embeddedAddress]);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => setVersion((v) => v + 1), 60_000);
    return () => clearInterval(t);
  }, [user]);

  const signOut = useCallback(async () => {
    await post('/auth/logout').catch(() => {});
    if (wallet.available) await wallet.logout().catch(() => {});
    setUser(null);
  }, [wallet]);

  if (user === undefined) return <Loading />;
  const ctx = { user, setUser, meta, version, bump, signOut, now: meta.now + (Date.now() - meta.fetchedAt) };
  const wrap = (roles, el, narrow) => <Guard user={user} roles={roles}><Layout narrow={narrow}>{el}</Layout></Guard>;

  return (
    <AppCtx.Provider value={ctx}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={user.onboarded ? homeFor(user.role) : '/welcome'} replace /> : <Login />} />
        <Route path="/" element={user ? <Navigate to={user.onboarded ? homeFor(user.role) : '/welcome'} replace /> : <Landing />} />
        <Route path="/welcome" element={!user ? <Navigate to="/login" replace /> : user.onboarded ? <Navigate to={homeFor(user.role)} replace /> : <Welcome />} />
        <Route path="/wallet" element={wrap(null, <Wallet />, true)} />

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
        <Route path="/care/payments" element={wrap(['coordinator'], <CarePayments />)} />
        <Route path="/care/people" element={wrap(['coordinator'], <CarePeople />)} />
        <Route path="/care/volunteers" element={wrap(['coordinator'], <CareVolunteers />)} />
        <Route path="/care/settings" element={wrap(['coordinator'], <CareSettings />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppCtx.Provider>
  );
}
