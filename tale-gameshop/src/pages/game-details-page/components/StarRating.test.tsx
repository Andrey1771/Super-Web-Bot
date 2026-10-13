import React from 'react';
import { render } from '@testing-library/react';
import { StarRating } from './shared';

/** Звёзды закрашиваются по оценке: пустые — серые, половинка — наполовину. Раньше все пять были оранжевыми при любой оценке. */

const classesOf = (container: HTMLElement) => [...container.querySelectorAll('.star')].map((star) => (star.getAttribute('class') ?? '').trim());

it('fills whole stars, halves the fraction and leaves the rest empty', () => {
  const { container } = render(<StarRating rating={3.5} />);
  expect(classesOf(container)).toEqual(['star is-full', 'star is-full', 'star is-full', 'star is-half', 'star']);
});

it('leaves every star empty for a game without reviews', () => {
  const { container } = render(<StarRating rating={0} />);
  expect(classesOf(container)).toEqual(['star', 'star', 'star', 'star', 'star']);
});

it('rounds a fraction below a half down to whole stars', () => {
  const { container } = render(<StarRating rating={4.4} />);
  expect(classesOf(container).filter((cls) => cls.includes('is-full'))).toHaveLength(4);
  expect(classesOf(container).some((cls) => cls.includes('is-half'))).toBe(false);
});
