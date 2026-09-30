import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewRevisions } from './ModerationPage';

jest.mock('devextreme-react/data-grid', () => ({ DataGrid: () => null, Column: () => null, Paging: () => null, Scrolling: () => null, Sorting: () => null }));
jest.mock('../../components/ui/ToastProvider', () => ({ useToast: () => ({ addToast: jest.fn() }) }));
jest.mock('../../components/layout/AdminHeaderContext', () => ({ useAdminHeader: () => ({ setPageTitle: jest.fn() }) }));
jest.mock('../../hooks/use-grid-window', () => ({ GRID_PAGE_SIZE: 20, REMOTE_PAGING: {}, gridStatusText: () => '', useGridWindow: () => ({}) }));
jest.mock('../../api/adminModerationApi', () => ({}));

/** История правок для модератора: плашка, предупреждение о правке под жалобами, прошлые версии по клику. */

const revisions = [
  { text: 'Still bad, but calmer.', rating: 2, replacedAt: '2026-09-27T10:00:00Z', underReport: true },
  { text: 'You are all idiots.', rating: 1, replacedAt: '2026-09-26T10:00:00Z', underReport: false }
];

it('renders nothing for a review that was never edited', () => {
  const { container } = render(<ReviewRevisions revisions={[]} />);
  expect(container).toBeEmptyDOMElement();
});

it('warns when the text was changed under report and reveals the old versions on click', async () => {
  render(<ReviewRevisions revisions={revisions} editedAt="2026-09-27T10:00:00Z" />);
  const toggle = screen.getByRole('button', { name: 'Edited after report' });
  expect(screen.queryByText('You are all idiots.')).toBeNull();

  await userEvent.click(toggle);
  expect(screen.getByText('You are all idiots.')).toBeInTheDocument();
  expect(screen.getByText('Still bad, but calmer.')).toBeInTheDocument();
  expect(screen.getByText('under report')).toBeInTheDocument();
});

it('counts plain edits without a warning', () => {
  render(<ReviewRevisions revisions={[revisions[1]]} />);
  expect(screen.getByRole('button', { name: 'Edited 1×' })).not.toHaveClass('moderation__pill--warn');
});
