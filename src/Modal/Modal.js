import React, { Component } from 'react';
import './Modal.css';

// Modal that displays message to user
class Modal extends Component {
  constructor(props) {
    super(props);

    this.closeModal = this.closeModal.bind(this);
    this.copyLink = this.copyLink.bind(this);
  }

  /* Add event listener that detects clicks outside of modal to close it if
  component gets updated to display modal */
  shouldComponentUpdate(nextProps, nextState) {
    if (nextProps.display !== this.props.display) {
      document.addEventListener('click', this.closeModal, false);

      return true;
    }

    return false;
  }

  // Hide modal when user clicks close button
  closeModal(e) {
    // Do nothing if user clicks in modal (and not on close button)
    if (this.node.contains(e.target) &&
      !e.target.classList.contains('close-button')) {
        return;
    }

    // Remove event listener that detects clicks outside of modal to close it
    document.removeEventListener('click', this.closeModal, false);

    return this.props.onCloseModal();
  }

  // Copy modal link to clipboard when user clicks copy button
  copyLink(e) {
    // Create hidden textarea for link
    const link = document.createElement('textarea');
    link.classList.add('hidden');

    // Set textarea value to modal link
    link.value = e.target.dataset.link;
    document.body.appendChild(link);

    // Copy the textarea
    link.focus();
    link.select();
    document.execCommand('copy');

    // Remove textarea
    return document.body.removeChild(link);
  }

  render() {
    return (
      <div className={this.props.display ? ('modal') : ('modal hidden')}
        ref={node => { this.node = node; }}>
          <button className="close-button" onClick={this.closeModal}>x</button>
          <div className={'modal-header ' +
            (this.props.status === 'fail' ? ('fail') : ('success'))}>
              {this.props.status === 'fail' ? ('Error') : ('Saved')}
          </div>
          <div className="modal-body">
            {this.props.message} {this.props.link ? (
              <div className="link-container">
                <a href={this.props.link} target="_blank">
                  {this.props.link}
                </a>
                <button title="Copy"
                  data-link={this.props.link}
                  onClick={this.copyLink}>
                    <i className="far fa-copy" data-link={this.props.link}></i>
                </button>
              </div>
            ) : (null)}
          </div>
      </div>
    );
  }
}

export default Modal;
