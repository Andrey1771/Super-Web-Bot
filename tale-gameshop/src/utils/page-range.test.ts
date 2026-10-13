import { buildPageRange } from './page-range';

it('lists every page while there are seven or fewer', () => {
  expect(buildPageRange(1, 1)).toEqual([]);
  expect(buildPageRange(2, 3)).toEqual([1, 2, 3]);
  expect(buildPageRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

it('collapses the far side into an ellipsis on long lists', () => {
  expect(buildPageRange(1, 12)).toEqual([1, 2, 3, 4, 'ellipsis', 11, 12]);
  expect(buildPageRange(6, 12)).toEqual([1, 'ellipsis', 5, 6, 7, 'ellipsis', 12]);
  expect(buildPageRange(11, 12)).toEqual([1, 2, 'ellipsis', 9, 10, 11, 12]);
});
