import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SocialLinksEditor from "./SocialLinksEditor";

const networks = [
  { network: "telegram", title: "Telegram", example: "https://t.me/yourchannel" },
  { network: "x", title: "X", example: "https://x.com/yourprofile" },
];

describe("SocialLinksEditor", () => {
  it("keeps only filled networks and reports null when everything is cleared", () => {
    const onChange = jest.fn();
    const { rerender } = render(<SocialLinksEditor value={[]} networks={networks} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText("https://t.me/yourchannel"), { target: { value: "https://t.me/shop" } });
    expect(onChange).toHaveBeenLastCalledWith([{ network: "telegram", url: "https://t.me/shop" }]);

    rerender(<SocialLinksEditor value={[{ network: "telegram", url: "https://t.me/shop" }]} networks={networks} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("https://t.me/yourchannel"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
