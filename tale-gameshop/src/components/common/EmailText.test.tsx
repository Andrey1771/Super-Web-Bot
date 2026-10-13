import React from 'react';
import { render } from '@testing-library/react';
import EmailText from './EmailText';

/** Почта переносится только перед «@»: две неразрывные половинки и <wbr> между ними. */
it('splits the address before the at sign', () => {
  const { container } = render(<p><EmailText email="demo-admin@taleshop-demo.invalid" /></p>);
  const parts = container.querySelectorAll('.email-text__part');
  expect([...parts].map((p) => p.textContent)).toEqual(['demo-admin', '@taleshop-demo.invalid']);
  expect(container.querySelector('wbr')).not.toBeNull();
  expect(container.textContent).toBe('demo-admin@taleshop-demo.invalid');
});

it('renders other values as is', () => {
  expect(render(<p><EmailText email="no-at-sign" /></p>).container.textContent).toBe('no-at-sign');
  expect(render(<p><EmailText email={null} /></p>).container.textContent).toBe('');
});
