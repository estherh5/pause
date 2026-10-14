import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FeedbackThread from './FeedbackThread.jsx';

const head = { body: 'it broke', createdAt: '2026-10-01T10:00:00.000Z', authorLabel: 'u@x.com' };
const messages = [
  { id: 'm1', author: 'admin', channel: 'web', body: 'fixed, try now', emailStatus: 'sent', createdAt: '2026-10-02T10:00:00.000Z' },
  { id: 'm2', author: 'user', channel: 'email', body: 'still broken by mail', createdAt: '2026-10-03T10:00:00.000Z' },
  { id: 'm3', author: 'user', channel: 'web', body: 'and from the site', createdAt: '2026-10-04T10:00:00.000Z' },
];

const bubbleOf = (text) => screen.getByText(text).closest('.fb-bubble');

describe.each([
  ['admin triage', true],
  ['member widget', false],
])('FeedbackThread "via email" mark (%s)', (_name, showEmailStatus) => {
  it('marks only the message whose channel is email', () => {
    // Discriminating case: two user messages, one per channel — only the
    // emailed one is marked, so the mark follows channel, not author.
    render(<FeedbackThread head={head} messages={messages} showEmailStatus={showEmailStatus} />);
    const marks = screen.getAllByText('via email');
    expect(marks).toHaveLength(1);
    expect(bubbleOf('still broken by mail')).toContainElement(marks[0]);
    expect(marks[0]).toHaveClass('fb-via-email');
    expect(marks[0].closest('.fb-bubble-meta')).not.toBeNull();
    expect(bubbleOf('and from the site').textContent).not.toContain('via email');
    expect(bubbleOf('fixed, try now').textContent).not.toContain('via email');
  });
});
