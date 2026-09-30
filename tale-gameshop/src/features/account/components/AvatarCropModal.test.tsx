import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AvatarCropModal from './AvatarCropModal';
import { AVATAR_BACKDROPS, DEFAULT_BACKDROP_COLOR } from '../../../utils/avatarBackdrop';

/**
 * Выбор подложки под аватар.
 *
 * Картинка без фона сохранялась с альфой, и сквозь дырки просвечивал фон кружка — свой
 * в каждом месте сайта. Теперь фон запекается в файл при кропе, поэтому важно, что
 * выбранный цвет действительно доезжает до экспорта, а не остаётся украшением.
 */

const mockHasTransparency = jest.fn();
const mockGetCroppedAvatarFile = jest.fn();

jest.mock('../../../utils/cropImage', () => ({
    hasTransparency: (src: string) => mockHasTransparency(src),
    getCroppedAvatarFile: (...args: unknown[]) => mockGetCroppedAvatarFile(...args),
}));

const renderModal = () =>
    render(
        <AvatarCropModal
            imageSrc="blob:avatar"
            isOpen
            isSaving={false}
            onClose={jest.fn()}
            onSave={jest.fn().mockResolvedValue(undefined)}
        />
    );

/** Аргумент подложки в вызове экспорта. */
const savedBackdrop = () => mockGetCroppedAvatarFile.mock.calls[0][7];

beforeAll(() => {
    // Сцена меряется ResizeObserver, которого в jsdom нет.
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

beforeEach(() => {
    mockHasTransparency.mockReset();
    mockGetCroppedAvatarFile.mockReset();
    mockGetCroppedAvatarFile.mockResolvedValue(new File([], 'avatar.webp'));
});

it('offers the site palette for a picture with see-through areas', async () => {
    mockHasTransparency.mockResolvedValue(true);
    renderModal();

    const first = await screen.findByTitle(AVATAR_BACKDROPS[0].label);
    expect(first).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTitle('Custom colour')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(AVATAR_BACKDROPS.length);
});

it('hides the choice for an opaque picture, where no backdrop would be visible', async () => {
    mockHasTransparency.mockResolvedValue(false);
    renderModal();

    await waitFor(() => expect(mockHasTransparency).toHaveBeenCalled());
    expect(screen.queryByTitle(AVATAR_BACKDROPS[0].label)).not.toBeInTheDocument();
});

it('bakes the default colour into the file when nothing is picked', async () => {
    mockHasTransparency.mockResolvedValue(true);
    renderModal();

    await screen.findByTitle(AVATAR_BACKDROPS[0].label);
    await userEvent.click(screen.getByRole('button', { name: 'Save avatar' }));

    await waitFor(() => expect(mockGetCroppedAvatarFile).toHaveBeenCalled());
    expect(savedBackdrop()).toBe(DEFAULT_BACKDROP_COLOR);
});

it('bakes a colour chosen from the palette', async () => {
    mockHasTransparency.mockResolvedValue(true);
    const ink = AVATAR_BACKDROPS.find((item) => item.id === 'ink');
    renderModal();

    await userEvent.click(await screen.findByTitle(ink!.label));
    await userEvent.click(screen.getByRole('button', { name: 'Save avatar' }));

    await waitFor(() => expect(mockGetCroppedAvatarFile).toHaveBeenCalled());
    expect(savedBackdrop()).toBe(ink!.color);
});

it('bakes a colour taken from the picker', async () => {
    mockHasTransparency.mockResolvedValue(true);
    const { container } = renderModal();

    await screen.findByTitle(AVATAR_BACKDROPS[0].label);
    const picker = container.querySelector('input[type="color"]') as HTMLInputElement;
    // Печатать в color-инпут нельзя — значение приходит из системного диалога, и в тесте
    // его подставляет событие change, как это делает сам браузер.
    fireEvent.change(picker, { target: { value: '#123456' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save avatar' }));

    await waitFor(() => expect(mockGetCroppedAvatarFile).toHaveBeenCalled());
    expect(savedBackdrop()).toBe('#123456');
});

it('leaves an opaque picture without a backdrop at all', async () => {
    mockHasTransparency.mockResolvedValue(false);
    renderModal();

    await waitFor(() => expect(mockHasTransparency).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save avatar' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Save avatar' }));

    await waitFor(() => expect(mockGetCroppedAvatarFile).toHaveBeenCalled());
    expect(savedBackdrop()).toBeNull();
});

it('previews the chosen colour under the art', async () => {
    mockHasTransparency.mockResolvedValue(true);
    const { container } = renderModal();

    await screen.findByTitle(AVATAR_BACKDROPS[0].label);
    // Сами тона проверяются в avatarBackdrop.test.ts: jsdom не разбирает radial-gradient
    // и выбрасывает такой inline-стиль, поэтому здесь — только наличие подложки.
    expect(container.querySelector('.ts-avatar-cropper-backdrop')).not.toBeNull();
});
