import { Component } from 'react';
import PropTypes from 'prop-types';
import { reportError } from '../lib/flare';

// PORTED from flare/reporters/next/app/global-error.tsx, by way of
// methods/src/components/FlareBoundary.tsx — React has no hook equivalent of a
// root error boundary, so this is a class component using componentDidCatch
// instead of Next's error-page file convention. No <html>/<body> wrapper: this
// mounts inside pause's own index.html, which already owns those tags.
//
// `propTypes` below is not decoration — pause's eslint config extends
// react.configs.flat.recommended, which makes react/prop-types an error, and
// `npm run lint` fails without it. methods' TypeScript version has no
// equivalent because its types serve the same purpose at compile time.
//
// The copy is the fleet's, deliberately — every crash screen in every app says
// the same three things, so a reader who has seen one has seen them all. The
// LOOK is pause's, equally deliberately: methods' cream-and-ink version would
// read as a different product dropped into the middle of this one.
//
// On color, one measurement decided the layout: pause's signature green
// #0edc00 manages only 1.9:1 against white, so it CANNOT carry text here. It
// is a button fill instead, where black on it reaches 10.8:1. Body copy is
// #3f3f3f (10.5:1) rather than one of pause's own greys, because every grey
// the app owns — #989898 is the darkest — tops out near 2.8:1 on white and
// fails the 4.5:1 floor. It is derived from pause's black, not borrowed.
//
// Styles are inline because this file is a port that must stay portable: it
// carries no class names, so it cannot be broken by a stylesheet it does not
// own, and it still renders correctly if the CSS bundle is the thing that
// failed to load. `outline` is deliberately never set, so the browser's own
// focus ring survives for keyboard users.

export class FlareBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    void reportError(error, { kind: 'client', componentStack: info.componentStack });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          background: '#ffffff',
          color: '#3f3f3f',
          font: "400 1rem/1.55 'Raleway', system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: '26rem', textAlign: 'center' }}>
          <h1
            style={{
              font: "400 2.75rem/1.15 'Satisfy', system-ui, cursive",
              color: '#000000',
              margin: '0 0 0.75rem',
            }}
          >
            This page stopped working
          </h1>
          <p style={{ margin: '0 0 1.75rem', color: '#3f3f3f' }}>
            The error was reported automatically. Trying again often works.
          </p>
          <button
            type="button"
            onClick={this.reset}
            style={{
              font: "700 0.95rem/1 'Raleway', system-ui, sans-serif",
              padding: '0.75rem 1.4rem',
              minHeight: '44px',
              border: '2px solid #000000',
              borderRadius: '4px',
              background: '#0edc00',
              color: '#000000',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </div>
    );
  }
}

FlareBoundary.propTypes = {
  children: PropTypes.node,
};
