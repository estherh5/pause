import { useEffect, useRef, useState } from 'react';
import './Header.css';

const PROJECTS = [
  ['https://crystalprism.io/', 'Home', 'https://crystalprism.io/favicon.ico'],
  ['https://crystalprism.io/timespace/', 'Timespace', 'https://crystalprism.io/timespace/favicon.ico'],
  ['https://crystalprism.io/shapes-in-rain/', 'Shapes in Rain', 'https://crystalprism.io/shapes-in-rain/favicon.ico'],
  ['https://crystalprism.io/rhythm-of-life/', 'Rhythm of Life', 'https://crystalprism.io/rhythm-of-life/favicon.ico'],
  ['https://crystalprism.io/canvashare/', 'CanvaShare', 'https://crystalprism.io/canvashare/favicon.ico'],
  ['https://crystalprism.io/thought-writer/', 'Thought Writer', 'https://crystalprism.io/thought-writer/favicon.ico'],
  ['https://crystalprism.io/vicarious/', 'Vicarious', 'https://crystalprism.io/vicarious/favicon.ico'],
  ['https://hn-stats.crystalprism.io/', 'Hacker News Stats', 'https://hn-stats.crystalprism.io/favicon.ico'],
  ['https://pause.crystalprism.io/', 'Pause', 'https://pause.crystalprism.io/favicon.ico'],
  ['https://marian.crystalprism.io/', 'Marian', 'https://marian.crystalprism.io/favicon.ico'],
  ['https://vroom.crystalprism.io/', 'Vroom', 'https://vroom.crystalprism.io/favicon.ico'],
  ['https://crystalprism.io/user/sign-in/', 'Account', 'https://crystalprism.io/favicon.ico'],
].map(([link, title, favicon]) => ({ link, title, favicon }));

function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function closeOnOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isOpen]);

  return (
    <div id="header">
      <div id="header-container">
        <div id="site-menu-icon-container">
          <button
            type="button"
            title="Toggle site menu"
            aria-expanded={isOpen}
            aria-controls="site-menu"
            onClick={() => setIsOpen((open) => !open)}
          >
            <img
              id="site-menu-icon"
              alt=""
              src={`https://crystalprism.io/images/site-menu-icon${isOpen ? '' : '-shadow'}.svg`}
            />
          </button>
        </div>
        <table
          id="site-menu"
          className={isOpen ? 'opened' : 'closed'}
          ref={menuRef}
        >
          <tbody>
            <tr id="site-menu-spacer-row" />
            {PROJECTS.map((project) => (
              <tr key={project.title} className="site-menu-row">
                <td className="site-menu-image-cell">
                  <img
                    className="site-menu-image"
                    alt=""
                    src={project.favicon}
                  />
                </td>
                <td className="site-menu-text-cell">
                  <a
                    className="site-menu-text"
                    title={project.title}
                    href={project.link}
                  >
                    {project.title}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Header;
