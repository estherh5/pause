import BackLink from '../components/BackLink.jsx';
import './AuthPages.css';

export default function PrivacyPage() {
  return (
    <main className="pause-page pause-reading">
      <BackLink />
      <h1 className="pause-page-title">Privacy</h1>
      <h2>What Pause stores</h2>
      <p>An anonymous plan stores the plan itself and the time it was created. No account and no IP address are stored with it.</p>
      <p>A saved plan stores the same, plus your email address and the plan&apos;s name.</p>
      <p>An invitation stores the invitee&apos;s email address and an optional note. Feedback stores your message, the page, your browser string and your email address.</p>
      <h2>Who else is involved</h2>
      <p>Google handles sign-in. Vercel hosts Pause. Turso holds the database. Resend sends email. Plausible counts page views without cookies, on Esther&apos;s own server. flare receives error reports, which carry the stack and the page path only.</p>
      <h2>Cookies</h2>
      <p>One sign-in session cookie, shared across crystalprism.io apps. There are no others.</p>
      <h2>Deleting your data</h2>
      <p>Delete a saved plan from My plans. For anything else, including an anonymous share link, email pause@crystalprism.io.</p>
    </main>
  );
}
