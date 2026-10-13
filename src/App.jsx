import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ConfirmProvider } from './components/ConfirmDialog.jsx';
import Fab from './components/Fab.jsx';
import Header from './Header/Header.jsx';
import Planner from './pages/Planner.jsx';
import { PlannerProvider } from './lib/planner-context.jsx';
import { useMe } from './lib/queries.js';
import { interceptInternalLinks } from './lib/spa-links.js';
import './App.css';
import './components/ui.css';

const PlansPage = lazy(() => import('./pages/PlansPage.jsx'));

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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Fab />
      </div>
      </ConfirmProvider>
    </PlannerProvider>
  );
}

export default App;
