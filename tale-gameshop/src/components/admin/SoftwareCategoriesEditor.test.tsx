import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SoftwareCategoriesEditor from './SoftwareCategoriesEditor';

/**
 * Категории раздела /software. Категорию с товарами нельзя удалить и нельзя поменять ей адрес — иначе товары
 * выпали бы из раздела, а ссылки на категорию перестали бы открываться. Новой категории адрес подставляется
 * из названия.
 */

const mockGet = jest.fn();
const mockSave = jest.fn();
const mockToast = jest.fn();

jest.mock('../../api/adminSoftwareApi', () => ({
  getAdminSoftwareCategories: () => mockGet(),
  saveAdminSoftwareCategories: (list: unknown) => mockSave(list),
  apiErrorMessage: (_: unknown, fallback: string) => fallback,
}));

jest.mock('../ui/ToastProvider', () => ({
  useToast: () => ({ addToast: mockToast }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue([
    { tag: 'security', title: 'Antivirus & security', count: 3 },
    { tag: 'vpn', title: 'VPN & privacy', count: 0 },
  ]);
  mockSave.mockImplementation(async (list: Array<{ tag: string; title: string }>) => list.map((row) => ({ ...row, count: 0 })));
});

it('locks the address and removal of a category that has products', async () => {
  render(<SoftwareCategoriesEditor />);

  const addresses = await screen.findAllByLabelText('Category address');
  expect(addresses[0]).toBeDisabled();
  expect(addresses[1]).not.toBeDisabled();

  const remove = screen.getAllByLabelText('Remove category');
  expect(remove[0]).toBeDisabled();
  expect(remove[1]).not.toBeDisabled();
});

it('fills the address of a new category from its name and saves the list in order', async () => {
  render(<SoftwareCategoriesEditor />);
  await screen.findAllByLabelText('Category name');

  await userEvent.click(screen.getByRole('button', { name: 'Add category' }));
  const names = screen.getAllByLabelText('Category name');
  await userEvent.type(names[2], 'Backup Tools');
  expect(screen.getAllByLabelText('Category address')[2]).toHaveValue('backup-tools');

  // Новую — наверх: порядок списка и есть порядок раздела.
  await userEvent.click(screen.getAllByLabelText('Move up')[2]);
  await userEvent.click(screen.getAllByLabelText('Move up')[1]);
  await userEvent.click(screen.getByRole('button', { name: 'Save categories' }));

  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith([
      { tag: 'backup-tools', title: 'Backup Tools' },
      { tag: 'security', title: 'Antivirus & security' },
      { tag: 'vpn', title: 'VPN & privacy' },
    ]),
  );
  expect(mockToast).toHaveBeenCalledWith('Software categories saved.', 'success');
});
