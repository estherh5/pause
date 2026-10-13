import { useLocation, useNavigate } from 'react-router-dom';
import { fabFor } from '../lib/fab.js';
import { usePlanner } from '../lib/planner-context.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import './Fab.css';

export default function Fab() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { isDirty, resetSchedule } = usePlanner();
  const fab = fabFor(pathname);
  if (!fab) return null;

  async function run() {
    if (isDirty && !(await confirm({
      title: 'Start a new plan?', body: "The plan on screen has changes that aren't saved.",
      confirmLabel: 'Start new', cancelLabel: 'Keep editing',
    }))) return;
    resetSchedule();
    navigate('/');
  }
  return <button type="button" className="pause-fab" onClick={run}>+ {fab.label}</button>;
}
