import { renderHook } from '@testing-library/react';
import { useAccountIdentity } from './useAccountIdentity';

const mockProfile = jest.fn();
const mockToken = jest.fn();
jest.mock('./context/AccountProfileContext', () => ({ useAccountProfile: () => mockProfile() }));
jest.mock('@react-keycloak/web', () => ({ useKeycloak: () => ({ keycloak: { tokenParsed: mockToken() } }) }));

beforeEach(() => {
  mockProfile.mockReset();
  mockToken.mockReset();
});

/** Карточка «кто вошёл»: пока профиля нет — скелетон, а не выдуманные данные; потом — профиль, без него — токен. */
it('asks for a skeleton while the profile is loading and nothing is known', () => {
  mockProfile.mockReturnValue({ profile: null, isLoading: true });
  mockToken.mockReturnValue(undefined);
  const { result } = renderHook(() => useAccountIdentity());
  expect(result.current.isLoading).toBe(true);
  expect(result.current.email).toBe('');
});

it('uses the loaded profile', () => {
  mockProfile.mockReturnValue({
    profile: { displayName: 'Demo Admin', email: 'demo-admin@taleshop-demo.invalid', avatarUrl: null },
    isLoading: false,
  });
  mockToken.mockReturnValue({ name: 'Token Name' });
  const { result } = renderHook(() => useAccountIdentity());
  expect(result.current).toMatchObject({
    isLoading: false,
    displayName: 'Demo Admin',
    email: 'demo-admin@taleshop-demo.invalid',
    initials: 'DA',
  });
});

it('falls back to the token when the profile has no name', () => {
  mockProfile.mockReturnValue({ profile: { displayName: '', email: '', avatarUrl: null }, isLoading: false });
  mockToken.mockReturnValue({ preferred_username: 'demo-buyer', email: 'demo-buyer@taleshop-demo.invalid' });
  const { result } = renderHook(() => useAccountIdentity());
  expect(result.current.displayName).toBe('demo-buyer');
  expect(result.current.email).toBe('demo-buyer@taleshop-demo.invalid');
  expect(result.current.initials).toBe('D');
});
