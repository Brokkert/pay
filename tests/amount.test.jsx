// The amount field, and above all its sign.
//
// A phone's number pad has no minus key, so the minus is the euro sign you tap.
// That has to work in both orders: sign first and then the amount, or the
// amount first and then the sign.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AmountInput } from '../src/components/ui.jsx';

afterEach(cleanup);

function Harness({ start = 0 }) {
  const [cents, setCents] = useState(start);
  return (
    <>
      <AmountInput signed cents={cents} onChange={setCents} />
      <output>{cents}</output>
    </>
  );
}

const value = () => document.querySelector('output').textContent;
const field = () => screen.getByPlaceholderText('0,00');
const sign = () => screen.getByRole('button');

describe('the sign of an amount', () => {
  it('takes the minus first and the amount after', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(sign());
    await user.type(field(), '2,59');
    expect(value()).toBe('-259');
  });

  it('takes the amount first and the minus after', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '2,59');
    await user.click(sign());
    expect(value()).toBe('-259');
  });

  it('goes back to positive on a second tap', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(sign());
    await user.type(field(), '2,59');
    await user.click(sign());
    expect(value()).toBe('259');
  });

  it('keeps the minus while you correct the amount', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(sign());
    await user.type(field(), '2,59');
    await user.type(field(), '{Backspace}{Backspace}');
    expect(value()).toBe('-200');
    await user.type(field(), '75');
    expect(value()).toBe('-275');
  });

  it('shows a negative amount without its minus in the field', () => {
    render(<Harness start={-1250} />);
    expect(field().value).toBe('12,50');
    expect(sign().textContent).toBe('−€');
  });

  it('still understands a minus typed by hand', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '-2,59');
    expect(value()).toBe('-259');
    expect(sign().textContent).toBe('−€');
  });
});
