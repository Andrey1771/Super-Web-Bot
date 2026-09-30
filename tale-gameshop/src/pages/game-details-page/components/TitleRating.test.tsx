import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TitleRating from './TitleRating';

/**
 * Рейтинг под названием игры: оценка и число отзывов, «Top rated» только при живых отзывах
 * и средней от 4.5, клик ведёт на вкладку отзывов.
 */

const line = () => screen.getByRole('button', { name: 'Reviews' });

it('shows the score, the review count and the Top rated mark for a rated game', async () => {
  const onClick = jest.fn();
  render(<TitleRating summary={{ average: 4.6, totalReviews: 8, label: 'Very Positive' }} isTopRated onClick={onClick} />);

  expect(line()).toHaveTextContent('4.6');
  expect(line()).toHaveTextContent('8 reviews');
  expect(line()).toHaveTextContent('Top rated');
  expect(screen.getByLabelText('Rating 4.6 out of 5')).toBeInTheDocument();

  await userEvent.click(line());
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('says there are no reviews yet and hides Top rated until real reviews exist', () => {
  render(<TitleRating summary={{ average: 0, totalReviews: 0, label: 'No reviews yet' }} isTopRated />);

  expect(line()).toHaveTextContent('No reviews yet');
  expect(line()).not.toHaveTextContent('Top rated');
  expect(line()).not.toHaveTextContent('0.0');
});

it('hides Top rated below the 4.5 threshold even when the admin flag is set', () => {
  render(<TitleRating summary={{ average: 3.0, totalReviews: 7, label: 'Mixed' }} isTopRated />);
  expect(line()).toHaveTextContent('3.0');
  expect(line()).not.toHaveTextContent('Top rated');
});

it('shows Top rated right at the threshold', () => {
  render(<TitleRating summary={{ average: 4.5, totalReviews: 2, label: 'Very Positive' }} isTopRated />);
  expect(line()).toHaveTextContent('Top rated');
});

it('uses the singular for a single review', () => {
  render(<TitleRating summary={{ average: 5, totalReviews: 1, label: 'Very Positive' }} />);
  expect(line()).toHaveTextContent('1 review');
});
