import React from 'react';
import { dataCell } from './ModerationPage';

jest.mock('devextreme-react/data-grid', () => ({ DataGrid: () => null, Column: () => null, Paging: () => null, Scrolling: () => null, Sorting: () => null }));
jest.mock('../../components/ui/ToastProvider', () => ({ useToast: () => ({ addToast: jest.fn() }) }));
jest.mock('../../components/layout/AdminHeaderContext', () => ({ useAdminHeader: () => ({ setPageTitle: jest.fn() }) }));
jest.mock('../../hooks/use-grid-window', () => ({ GRID_PAGE_SIZE: 20, REMOTE_PAGING: {}, gridStatusText: () => '', useGridWindow: () => ({}) }));
jest.mock('../../api/adminModerationApi', () => ({}));

/** Строки-заглушки грида (пустые данные во время загрузки или при пустой очереди) не рендерятся. */
it('renders a cell only for a real row', () => {
  const render = dataCell<{ id: string; reports: string[] }>((row) => <span>{row.reports.length} reports</span>);
  expect(render({ data: undefined })).toBeNull();
  expect(render({ data: null })).toBeNull();
  expect(render({ data: {} })).toBeNull();
  expect(render({ data: { id: 'r1', reports: ['a'] } })).not.toBeNull();
});
