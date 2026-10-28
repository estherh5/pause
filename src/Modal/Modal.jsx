import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import './Modal.css';

/** The save result and error notice, on a native <dialog> like SavePlanDialog:
 *  showModal() moves focus in, traps Tab, makes the page inert and returns
 *  focus to the opener on close. A closed dialog is display:none, so nothing
 *  in it can take focus. */
function Modal({ display, status, message, link, title, note, onCloseModal }) {
  const dialogRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (display && !d.open) {
      setCopied(false);
      d.showModal();
    } else if (!display && d.open) {
      d.close();
    }
  }, [display]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <dialog
      className="modal"
      ref={dialogRef}
      aria-labelledby="modal-title"
      onCancel={(event) => { event.preventDefault(); onCloseModal(); }}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(event) => { if (event.target === dialogRef.current) onCloseModal(); }}
    >
      <button
        type="button"
        className="close-button"
        onClick={onCloseModal}
        aria-label="Close"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <h2
        id="modal-title"
        className={`modal-header ${status === 'fail' ? 'fail' : 'success'}`}
      >
        {title || (status === 'fail' ? 'Error' : 'Saved')}
      </h2>
      <div className="modal-body">
        {message}
        {link && (
          <div className="link-container">
            <a href={link} target="_blank" rel="noreferrer">
              {link}
            </a>
            <button type="button" title="Copy link" aria-label={copied ? 'Link copied' : 'Copy link'} onClick={copyLink}>
              {copied ? <span className="copied">Copied</span> : <i className="far fa-copy" aria-hidden="true" />}
            </button>
          </div>
        )}
        {note && <p className="modal-note">{note}</p>}
      </div>
    </dialog>
  );
}

export default Modal;

Modal.propTypes = {
  display: PropTypes.bool.isRequired,
  status: PropTypes.oneOf(['loading', 'success', 'fail']),
  message: PropTypes.string,
  link: PropTypes.string,
  title: PropTypes.string,
  note: PropTypes.node,
  onCloseModal: PropTypes.func.isRequired,
};
