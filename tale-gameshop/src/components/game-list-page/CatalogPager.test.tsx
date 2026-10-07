import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CatalogPager from './CatalogPager';

/**
 * Листание каталога «‹ Страница [9] из 24 ›»: стрелки, ввод номера с поправкой на диапазон
 * и плашка, которая уезжает при прокрутке вниз и возвращается при прокрутке вверх.
 */

const input = () => screen.getByRole('textbox', { name: 'Page number' });

const scrollTo = (y: number) => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  fireEvent.scroll(window);
};

afterEach(() => {
  jest.useRealTimers();
  scrollTo(0);
});

it('shows the current page and the total', () => {
  render(<CatalogPager page={9} totalPages={24} onChange={jest.fn()} />);

  expect(input()).toHaveValue('9');
  expect(screen.getByText('of 24')).toBeInTheDocument();
});

it('steps with the arrows and disables them at the ends', async () => {
  const onChange = jest.fn();
  const { rerender } = render(<CatalogPager page={9} totalPages={24} onChange={onChange} />);

  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(onChange.mock.calls).toEqual([[10], [8]]);

  rerender(<CatalogPager page={1} totalPages={24} onChange={onChange} />);
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  rerender(<CatalogPager page={24} totalPages={24} onChange={onChange} />);
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

it('jumps to a typed page on Enter and clamps it to the range', async () => {
  const onChange = jest.fn();
  render(<CatalogPager page={9} totalPages={24} onChange={onChange} />);

  await userEvent.click(input());
  await userEvent.keyboard('20{Enter}');
  expect(onChange).toHaveBeenLastCalledWith(20);

  await userEvent.click(input());
  await userEvent.keyboard('99{Enter}');
  expect(onChange).toHaveBeenLastCalledWith(24);
  // Каждый Enter — ровно один переход.
  expect(onChange).toHaveBeenCalledTimes(2);
});

it('ignores letters and restores the page on Escape or empty input', async () => {
  const onChange = jest.fn();
  render(<CatalogPager page={9} totalPages={24} onChange={onChange} />);

  await userEvent.click(input());
  await userEvent.keyboard('ab');
  expect(input()).toHaveValue('');
  await userEvent.keyboard('{Enter}');
  expect(input()).toHaveValue('9');

  await userEvent.click(input());
  await userEvent.keyboard('15{Escape}');
  expect(input()).toHaveValue('9');
  expect(onChange).not.toHaveBeenCalled();
});

it('is not shown for a single page', () => {
  const { container } = render(<CatalogPager page={1} totalPages={1} onChange={jest.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

it('hides while scrolling down and comes back on scroll up or after a pause', () => {
  jest.useFakeTimers();
  render(<CatalogPager page={9} totalPages={24} onChange={jest.fn()} />);
  const nav = screen.getByRole('navigation');

  act(() => scrollTo(600));
  expect(nav).toHaveClass('is-hidden');

  act(() => scrollTo(500));
  expect(nav).not.toHaveClass('is-hidden');

  act(() => scrollTo(900));
  expect(nav).toHaveClass('is-hidden');
  act(() => {
    jest.advanceTimersByTime(800);
  });
  expect(nav).not.toHaveClass('is-hidden');
});
