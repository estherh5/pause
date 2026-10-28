import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, useConfirm } from './ConfirmDialog.jsx';

function Opener() {
  const confirm = useConfirm();
  return (
    <button type="button" onClick={() => confirm({ title: 'Discard?', body: 'Gone.', cancelLabel: 'Keep', confirmLabel: 'Discard' })}>
      New plan
    </button>
  );
}

const mount = () => render(<ConfirmProvider><Opener /></ConfirmProvider>);

describe('ConfirmDialog', () => {
  // jsdom does not make the page inert behind a modal, so focus() on the opener
  // "works" here whatever the order. In a browser it is a no-op until the dialog
  // closes, so the order itself is the contract.
  it.each([
    ['Escape', () => fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))],
    ['Keep', () => screen.getByRole('button', { name: 'Keep' }).click()],
    ['Discard', () => screen.getByRole('button', { name: 'Discard' }).click()],
  ])('%s closes the modal before returning focus to the opener', async (_, act) => {
    const user = userEvent.setup();
    mount();
    const opener = screen.getByRole('button', { name: 'New plan' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    const order = [];
    const close = dialog.close.bind(dialog);
    dialog.close = vi.fn(() => { order.push('close'); close(); });
    const focus = opener.focus.bind(opener);
    opener.focus = vi.fn(() => { order.push(dialog.open ? 'focus-while-open' : 'focus'); focus(); });
    act();
    expect(order).toEqual(['close', 'focus']);
    expect(document.activeElement).toBe(opener);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
