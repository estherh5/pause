import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ConfirmProvider } from './components/ConfirmDialog.jsx';
import Fab from './components/Fab.jsx';
import FeedbackWidget from './components/FeedbackWidget.jsx';
import Header from './Header/Header.jsx';
import Planner from './pages/Planner.jsx';
import { PlannerProvider } from './lib/planner-context.jsx';
import { isMember, useMe } from './lib/queries.js';
import { interceptInternalLinks } from './lib/spa-links.js';
import './App.css';
import './components/ui.css';

const PlansPage = lazy(() => import('./pages/PlansPage.jsx'));
const StatsPage = lazy(() => import('./pages/StatsPage.jsx'));
const SignInPage = lazy(() => import('./pages/SignInPage.jsx'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx'));
const InvitePage = lazy(() => import('./pages/InvitePage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const AdminFeedbackPage = lazy(() => import('./pages/AdminFeedbackPage.jsx'));

function App() {
  const { data: me = null } = useMe();
  const navigate = useNavigate();
  useEffect(() => interceptInternalLinks(navigate), [navigate]);

  return (
    <PlannerProvider>
      <ConfirmProvider>
      <div id="main-container">
        <Header me={me} />
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Planner me={me} />} />
            <Route path="/plans" element={<PlansPage me={me} />} />
            <Route path="/stats" element={<StatsPage me={me} />} />
            <Route path="/signin" element={<SignInPage me={me} />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/settings" element={<SettingsPage me={me} />} />
            <Route path="/admin/feedback" element={<AdminFeedbackPage me={me} />} />
            <Route path="/invite/:token" element={<InvitePage me={me} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Fab />
        {isMember(me) && <FeedbackWidget />}
      </div>
      </ConfirmProvider>
    </PlannerProvider>
  );
}

export default App;
