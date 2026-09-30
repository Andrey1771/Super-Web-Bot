import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeamEditor, { EMPTY_TEAM_MEMBER } from "./TeamEditor";
import type { TeamMember } from "./TeamEditor";

// Окно кадрирования рисует картинку на канве, которой в jsdom нет. Здесь важно другое:
// доходит ли до него выбранный файл и уезжает ли результат в нужную строку.
jest.mock("../../features/account/components/AvatarCropModal", () => ({
  __esModule: true,
  default: ({
    isOpen,
    imageSrc,
    isSaving,
    onSave,
    onClose,
  }: {
    isOpen: boolean;
    imageSrc: string | null;
    isSaving: boolean;
    onSave: (file: File) => void;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div>
        <span>crop:{imageSrc}</span>
        {isSaving && <span>crop-saving</span>}
        <button type="button" onClick={() => onSave(new File(["x"], "avatar.png", { type: "image/png" }))}>
          crop-save
        </button>
        <button type="button" onClick={onClose}>
          crop-close
        </button>
      </div>
    ) : null,
}));

const mockPost = jest.fn();
const mockAddToast = jest.fn();

jest.mock("../../inversify.config", () => ({
  __esModule: true,
  default: {
    get: (id: unknown) =>
      String(id).includes("Url") ? { apiBaseUrl: "http://api.test" } : { api: { post: (...args: unknown[]) => mockPost(...args) } },
  },
}));

jest.mock("../ui/ToastProvider", () => ({
  __esModule: true,
  useToast: () => ({ addToast: (...args: unknown[]) => mockAddToast(...args) }),
}));

const person = (over: Partial<TeamMember> = {}): TeamMember => ({
  ...EMPTY_TEAM_MEMBER,
  name: "Sam Rivera",
  ...over,
});

const show = (value: TeamMember[]) => {
  const onChange = jest.fn();
  const utils = render(<TeamEditor value={value} maxMembers={12} onChange={onChange} />);
  return { onChange, ...utils };
};

const pngFile = (name = "face.png", type = "image/png", size = 1024) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

const fileInput = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  mockPost.mockReset();
  mockAddToast.mockReset();
  mockPost.mockResolvedValue({ data: { id: "m1", url: "/uploads/images/sam.png" } });
  // jsdom не реализует объектные ссылки на файлы.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = jest.fn(() => "blob:face");
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = jest.fn();
});

it("без фотографии кружок показывает первую букву имени", () => {
  const { container } = show([person()]);

  expect(container.querySelector(".team-editor__avatar img")).toBeNull();
  expect(screen.getByText("S")).toBeInTheDocument();
});

it("выбранный файл открывает то же окно кадрирования, что и аватар в профиле", async () => {
  const { container } = show([person()]);

  await userEvent.click(screen.getByTitle("Upload photo"));
  await userEvent.upload(fileInput(container), pngFile());

  expect(await screen.findByText("crop:blob:face")).toBeInTheDocument();
});

it("кадрированный квадрат уходит в медиатеку, а в строку — его адрес", async () => {
  const { container, onChange } = show([person()]);

  await userEvent.click(screen.getByTitle("Upload photo"));
  await userEvent.upload(fileInput(container), pngFile());
  await userEvent.click(await screen.findByText("crop-save"));

  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ photoUrl: "/uploads/images/sam.png" })])
  );
  expect(mockPost).toHaveBeenCalledWith("/api/media/upload", expect.any(FormData), expect.anything());
});

it("фотография попадает той строке, у которой её выбирали", async () => {
  const { container, onChange } = show([person({ name: "Sam Rivera" }), person({ name: "Ada Lovelace" })]);

  await userEvent.click(screen.getAllByTitle("Upload photo")[1]);
  await userEvent.upload(fileInput(container), pngFile());
  await userEvent.click(await screen.findByText("crop-save"));

  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Sam Rivera", photoUrl: "" }),
      expect.objectContaining({ name: "Ada Lovelace", photoUrl: "/uploads/images/sam.png" }),
    ])
  );
});

it("слишком большой файл до кадрирования не доходит", async () => {
  const { container, onChange } = show([person()]);

  await userEvent.click(screen.getByTitle("Upload photo"));
  await userEvent.upload(fileInput(container), pngFile("huge.png", "image/png", 3 * 1024 * 1024));

  expect(screen.queryByText(/^crop:/)).not.toBeInTheDocument();
  expect(mockAddToast).toHaveBeenCalledWith("File too large (max 2MB).", "error");
  expect(onChange).not.toHaveBeenCalled();
});

it("чужой формат до кадрирования не доходит", async () => {
  const { container } = show([person()]);

  await userEvent.click(screen.getByTitle("Upload photo"));
  // user-event сам отсеивает файлы вне accept; здесь проверяется собственная проверка формата в редакторе.
  await userEvent.upload(fileInput(container), pngFile("doc.pdf", "application/pdf"), { applyAccept: false });

  expect(screen.queryByText(/^crop:/)).not.toBeInTheDocument();
  expect(mockAddToast).toHaveBeenCalledWith("Unsupported format. Use PNG, JPG, or WebP.", "error");
});

it("сорвавшаяся загрузка не ставит человеку пустой адрес", async () => {
  mockPost.mockRejectedValue({ response: { data: "Image exceeds 15MB limit." } });
  const { container, onChange } = show([person()]);

  await userEvent.click(screen.getByTitle("Upload photo"));
  await userEvent.upload(fileInput(container), pngFile());
  await userEvent.click(await screen.findByText("crop-save"));

  await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith("Image exceeds 15MB limit.", "error"));
  expect(onChange).not.toHaveBeenCalled();
});

it("путь от корня достраивается до адреса медиатеки", () => {
  const { container } = show([person({ photoUrl: "/uploads/images/sam.png" })]);

  const img = container.querySelector(".team-editor__avatar img") as HTMLImageElement;
  expect(img.getAttribute("src")).toBe("http://api.test/uploads/images/sam.png");
});

it("фотографию можно снять, не трогая остальные поля", async () => {
  const { onChange } = show([person({ photoUrl: "/uploads/images/sam.png", role: "Founder" })]);

  await userEvent.click(screen.getByTitle("Remove photo"));

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ photoUrl: "", name: "Sam Rivera", role: "Founder" }),
  ]);
});

it("снимать нечего, пока фотографии нет", () => {
  show([person()]);

  expect(screen.queryByTitle("Remove photo")).not.toBeInTheDocument();
});

it("новый человек добавляется без фотографии", async () => {
  const { onChange } = show([]);

  await userEvent.click(screen.getByRole("button", { name: "Add person" }));

  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ photoUrl: "" })]);
});
