import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import ScrollToTop from './ScrollToTop';

/** Скролл сбрасывается только при смене пути; смена одних query-параметров позицию не трогает. */

const Nav = () => {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/games/x?tab=reviews', { replace: true })}>tab</button>
      <button type="button" onClick={() => navigate('/games/x?tab=reviews&page=2')}>page</button>
      <button type="button" onClick={() => navigate('/games/y')}>other</button>
    </>
  );
};

const setup = () => {
  const scrollTo = jest.fn();
  Object.defineProperty(window, 'scrollTo', { value: scrollTo, writable: true, configurable: true });
  render(
    <MemoryRouter initialEntries={['/games/x']}>
      <ScrollToTop />
      <Routes>
        <Route path="/games/:slug" element={<Nav />} />
      </Routes>
    </MemoryRouter>
  );
  scrollTo.mockClear();
  return scrollTo;
};

it('leaves the scroll alone when only the query string changes, even across replace and push', async () => {
  const scrollTo = setup();
  await userEvent.click(screen.getByText('tab'));
  await userEvent.click(screen.getByText('page'));
  expect(scrollTo).not.toHaveBeenCalled();
});

it('still resets the scroll when the path changes', async () => {
  const scrollTo = setup();
  await userEvent.click(screen.getByText('other'));
  expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
});
