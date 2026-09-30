import React, { useEffect } from "react";
import { render } from "@testing-library/react";
import LanguageScope from "./LanguageScope";

const preferences = { lang: "en" };
jest.mock("../../context/site-preferences", () => ({
  useSitePreferences: () => preferences,
}));

describe("LanguageScope", () => {
  it("remounts its children when the site language changes and not otherwise", () => {
    const mounts = jest.fn();
    const Page: React.FC = () => {
      useEffect(() => {
        mounts();
      }, []);
      return <div>page</div>;
    };
    // Каждый раз новые элементы: в приложении смену языка приносит контекст, здесь — обычный ререндер.
    const tree = () => (
      <LanguageScope>
        <Page />
      </LanguageScope>
    );

    const view = render(tree());
    view.rerender(tree());
    expect(mounts).toHaveBeenCalledTimes(1);

    preferences.lang = "uk";
    view.rerender(tree());
    expect(mounts).toHaveBeenCalledTimes(2);
  });
});
