import PropTypes from 'prop-types';
import { Fragment } from 'react';
import { tokenizeLinks } from '../lib/linkify.js';

/** Render user text with URLs and bare domains as safe external links. */
export default function Linkify({ text }) {
  return (
    <>
      {tokenizeLinks(text).map((tok, i) =>
        tok.type === 'link' ? (
          <a key={i} href={tok.href} target="_blank" rel="noreferrer noopener" className="pause-link">
            {tok.value}
          </a>
        ) : (
          <Fragment key={i}>{tok.value}</Fragment>
        ),
      )}
    </>
  );
}
Linkify.propTypes = { text: PropTypes.string.isRequired };
