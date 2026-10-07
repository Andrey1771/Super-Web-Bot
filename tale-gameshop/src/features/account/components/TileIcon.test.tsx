import React from 'react';
import { render } from '@testing-library/react';
import { faCoins, faStar } from '@fortawesome/free-solid-svg-icons';
import TileIcon, { tileIconMask } from './TileIcon';

/**
 * Значок в плашке уровня — маска, холст которой обрезан по рисунку: центр маски — центр звезды, а не центр
 * холста FontAwesome (у звезды верхний луч выходит за холст).
 */
it('crops the star to its drawing', () => {
  const svg = decodeURIComponent(tileIconMask(faStar));
  expect(svg).toContain('viewBox="13 -32 550 526"');
  expect(svg).toContain(faStar.icon[4] as string);
});

it('falls back to the whole canvas for icons it has not measured', () => {
  expect(decodeURIComponent(tileIconMask(faCoins))).toContain('viewBox="0 0 512 512"');
});

it('draws a square of the given size, hidden from screen readers', () => {
  const { container } = render(<TileIcon icon={faStar} size={14} />);
  const icon = container.querySelector('.tile-icon') as HTMLElement;

  expect(icon).toHaveAttribute('aria-hidden', 'true');
  expect(icon.style.width).toBe('14px');
  expect(icon.style.height).toBe('14px');
});
