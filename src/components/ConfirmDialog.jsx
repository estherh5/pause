import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmContext = createContext(async () => false);
// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = () => useContext(ConfirmContext);

/** Themed confirm on a native <dialog> (DESIGN.md Dialogs): focus moves in,
 *  Tab is trapped, Escape cancels, focus returns to the opener. */
export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);
  const dialogRef = useRef(null);
  const opener = useRef(null);

  const confirm = useCallback((o) => new Promise((resolve) => {
    opener.current = document.activeElement;
    resolver.current = resolve;
    setOpts(o);
  }), []);

  const finish = useCallback((v) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
    // Close before focusing: while a modal <dialog> is open the rest of the page
    // is inert, so focus() on the opener does nothing and the unmount then drops
    // focus to <body>.
    if (dialogRef.current?.open) dialogRef.current.close();
    opener.current?.focus?.();
  }, []);

  useEffect(() => {
    if (opts && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [opts]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <dialog
          ref={dialogRef}
          className="pause-dialog"
          aria-labelledby="confirm-title"
          onCancel={(e) => { e.preventDefault(); finish(false); }}
        >
          <h2 id="confirm-title" className="pause-dialog-title">{opts.title}</h2>
          <p className="pause-dialog-body">{opts.body}</p>
          <div className="pause-dialog-actions">
            <button type="button" className="pause-quiet" onClick={() => finish(false)}>{opts.cancelLabel}</button>
            <button type="button" className="pause-button" autoFocus onClick={() => finish(true)}>{opts.confirmLabel}</button>
          </div>
        </dialog>
      )}
    </ConfirmContext.Provider>
  );
}

ConfirmProvider.propTypes = { children: PropTypes.node };
