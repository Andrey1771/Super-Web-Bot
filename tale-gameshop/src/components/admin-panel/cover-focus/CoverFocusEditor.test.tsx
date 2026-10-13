import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CoverFocusEditor from "./CoverFocusEditor";

/**
 * Точка фокуса обложки в админке: клик по картинке ставит точку, три рамки показывают обрезку вокруг неё,
 * сохранение уходит на сервер. Предупреждения — про маленький или слишком вытянутый исходник.
 */

// В jsdom нет PointerEvent: без него fireEvent.pointerDown теряет координаты клика.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent = PointerEventPolyfill;
}

const mockGet = jest.fn();
const mockPut = jest.fn();
jest.mock("../../../inversify.config", () => ({
  __esModule: true,
  default: { get: () => ({ api: { get: (...args: unknown[]) => mockGet(...args), put: (...args: unknown[]) => mockPut(...args) } }) },
}));

const mockAddToast = jest.fn();
jest.mock("../../ui/ToastProvider", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

const meta = (overrides: Record<string, unknown> = {}) => ({
  path: "images/abc.png",
  focusX: 0.5,
  focusY: 0.5,
  width: 1600,
  height: 1200,
  dominantColor: "#336699",
  minLongSide: 600,
  recommendedLongSide: 1200,
  ...overrides,
});

const url = "http://api.test/uploads/images/abc.png";

beforeEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
  mockAddToast.mockReset();
});

const stage = () => screen.getByRole("slider", { name: "Focus point" });
const stageRect = () => {
  stage().getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
};

it("loads the saved focus and previews every frame cropped around it", async () => {
  mockGet.mockResolvedValue({ data: meta({ focusX: 0.25, focusY: 0.75 }) });
  render(<CoverFocusEditor imageUrl={url} />);

  expect(await screen.findByText("1600 × 1200")).toBeInTheDocument();
  expect(mockGet).toHaveBeenCalledWith("/api/images/meta", { params: { path: url } });
  expect(screen.getByTestId("frame-square")).toHaveStyle({ objectPosition: "25.0% 75.0%" });
  expect(screen.getByTestId("frame-wide")).toHaveStyle({ objectPosition: "25.0% 75.0%" });
  expect(screen.getByRole("button", { name: "Save focus" })).toBeDisabled();   // ничего не менялось
});

it("moves the focus where the admin clicks and saves it", async () => {
  mockGet.mockResolvedValue({ data: meta() });
  mockPut.mockResolvedValue({ data: meta({ focusX: 0.1, focusY: 0.2 }) });
  render(<CoverFocusEditor imageUrl={url} />);
  await screen.findByText("1600 × 1200");
  stageRect();

  fireEvent.pointerDown(stage(), { clientX: 40, clientY: 60, pointerId: 1 });
  fireEvent.pointerUp(stage(), { pointerId: 1 });

  expect(screen.getByTestId("frame-portrait")).toHaveStyle({ objectPosition: "10.0% 20.0%" });
  const save = screen.getByRole("button", { name: "Save focus" });
  expect(save).toBeEnabled();

  await userEvent.click(save);
  await waitFor(() => expect(mockPut).toHaveBeenCalledWith("/api/images/meta", { path: url, focusX: 0.1, focusY: 0.2 }));
  expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining("saved"), "success");
  await waitFor(() => expect(screen.getByRole("button", { name: "Save focus" })).toBeDisabled());
});

it("warns about small and oddly shaped sources", async () => {
  mockGet.mockResolvedValue({ data: meta({ width: 900, height: 300 }) });
  render(<CoverFocusEditor imageUrl={url} />);

  const warnings = await screen.findByRole("status");
  expect(warnings).toHaveTextContent(/Small source: 900px/);
  expect(warnings).toHaveTextContent(/Unusual shape/);
});

it("steps aside for pictures the server cannot tune", async () => {
  mockGet.mockRejectedValue(new Error("404"));
  render(<CoverFocusEditor imageUrl="https://cdn.example.com/cover.png" />);

  expect(await screen.findByText(/not in the uploads folder/)).toBeInTheDocument();
  expect(screen.queryByRole("slider")).toBeNull();
});
