import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination';

it('renders nothing for a single page', () => {
  const { container } = render(<Pagination page={1} totalPages={1} onChange={jest.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

it('marks the current page, disables the edge arrow and reports clicks', async () => {
  const onChange = jest.fn();
  render(<Pagination page={1} totalPages={3} onChange={onChange} label="Review pages" note="Showing 1–10 of 23" />);

  expect(screen.getByRole('navigation', { name: 'Review pages' })).toBeInTheDocument();
  expect(screen.getByText('Showing 1–10 of 23')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Page 3' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(onChange.mock.calls).toEqual([[3], [2]]);
});

it('collapses long lists with an ellipsis and locks while loading', () => {
  render(<Pagination page={6} totalPages={12} onChange={jest.fn()} disabled />);
  expect(screen.getAllByText('…')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Page 3' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Page 7' })).toBeDisabled();
});
