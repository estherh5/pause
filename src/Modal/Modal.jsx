import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import './Modal.css';

function Modal({ display, status, message, link, onCloseModal }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!display) {
      return undefined;
    }

    function closeOnOutsideClick(event) {
      if (!modalRef.current?.contains(event.target)) {
        onCloseModal();
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        onCloseModal();
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [display, onCloseModal]);

  async function copyLink() {
    await navigator.clipboard.writeText(link);
  }

  return (
    <div
      className={display ? 'modal' : 'modal hidden'}
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-hidden={!display}
      aria-labelledby="modal-title"
    >
      <button
        className="close-button"
        onClick={onCloseModal}
        aria-label="Close"
      >
        x
      </button>
      <div
        id="modal-title"
        className={`modal-header ${status === 'fail' ? 'fail' : 'success'}`}
      >
        {status === 'fail' ? 'Error' : 'Saved'}
      </div>
      <div className="modal-body">
        {message}
        {link && (
          <div className="link-container">
            <a href={link} target="_blank" rel="noreferrer">
              {link}
            </a>
            <button title="Copy" aria-label="Copy link" onClick={copyLink}>
              <i className="far fa-copy" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;

Modal.propTypes = {
  display: PropTypes.bool.isRequired,
  status: PropTypes.oneOf(['loading', 'success', 'fail']),
  message: PropTypes.string,
  link: PropTypes.string,
  onCloseModal: PropTypes.func.isRequired,
};
