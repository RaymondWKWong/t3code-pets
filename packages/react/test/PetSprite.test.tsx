// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetSprite } from "../src/PetSprite.js";

const baseProps = {
  name: "Romeo",
  atlasUrls: { left: "blob:left", right: "blob:right" },
  dragDirection: null,
  frame: { row: 7, column: 3, durationMs: 120 },
  petSize: 0.5,
  position: { x: 40, y: 60 },
  side: "left" as const,
  onActivate: vi.fn(),
  onDragDirectionChange: vi.fn(),
  onHoverChange: vi.fn(),
  onPositionChange: vi.fn(),
  onPositionCommit: vi.fn(),
};

afterEach(cleanup);

describe("PetSprite", () => {
  it("uses the inward-facing atlas and exact frame offsets", () => {
    const { container, rerender } = render(<PetSprite {...baseProps} />);
    const overlay = container.firstElementChild;
    const sprite = screen.getByRole("button", { name: "Move Romeo pet" });

    expect(overlay).toHaveStyle({ pointerEvents: "none" });
    expect(sprite).toHaveStyle({
      pointerEvents: "auto",
      backgroundImage: 'url("blob:left")',
      backgroundPosition: "-288px -728px",
    });

    rerender(<PetSprite {...baseProps} side="right" />);
    expect(sprite).toHaveStyle({ backgroundImage: 'url("blob:right")' });

    rerender(<PetSprite {...baseProps} dragDirection="right" side="right" />);
    expect(sprite).toHaveStyle({ backgroundImage: 'url("blob:left")' });

    rerender(<PetSprite {...baseProps} dragDirection="left" side="left" />);
    expect(sprite).toHaveStyle({ backgroundImage: 'url("blob:right")' });
  });

  it("renders each pet size with matching frame geometry", () => {
    const { rerender } = render(<PetSprite {...baseProps} />);
    const sprite = screen.getByRole("button", { name: "Move Romeo pet" });

    expect(sprite).toHaveStyle({ width: "96px", height: "104px" });
    rerender(<PetSprite {...baseProps} petSize={0.75} />);
    expect(sprite).toHaveStyle({
      width: "144px",
      height: "156px",
      backgroundSize: "1152px 1716px",
      backgroundPosition: "-432px -1092px",
    });
  });

  it("treats a stationary pointer gesture as activation", () => {
    const onActivate = vi.fn();
    const onPositionChange = vi.fn();
    render(
      <PetSprite
        {...baseProps}
        onActivate={onActivate}
        onPositionChange={onPositionChange}
      />,
    );
    const sprite = screen.getByRole("button", { name: "Move Romeo pet" });

    fireEvent.pointerDown(sprite, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(sprite, {
      clientX: 102,
      clientY: 102,
      pointerId: 1,
    });
    fireEvent.pointerUp(sprite, {
      clientX: 102,
      clientY: 102,
      pointerId: 1,
    });

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it("reports the live horizontal drag direction and suppresses activation", () => {
    const onActivate = vi.fn();
    const onDragDirectionChange = vi.fn();
    const onPositionChange = vi.fn();
    const onPositionCommit = vi.fn();
    render(
      <PetSprite
        {...baseProps}
        onActivate={onActivate}
        onDragDirectionChange={onDragDirectionChange}
        onPositionChange={onPositionChange}
        onPositionCommit={onPositionCommit}
      />,
    );
    const sprite = screen.getByRole("button", { name: "Move Romeo pet" });

    fireEvent.pointerDown(sprite, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(sprite, {
      clientX: 120,
      clientY: 110,
      pointerId: 1,
    });
    fireEvent.pointerMove(sprite, {
      clientX: 110,
      clientY: 115,
      pointerId: 1,
    });
    fireEvent.pointerUp(sprite, {
      clientX: 110,
      clientY: 115,
      pointerId: 1,
    });
    fireEvent.click(sprite, { detail: 1 });

    expect(onDragDirectionChange.mock.calls).toEqual([
      ["right"],
      ["left"],
      [null],
    ]);
    expect(onPositionChange.mock.calls).toEqual([
      [{ x: 60, y: 70 }],
      [{ x: 50, y: 75 }],
    ]);
    expect(onPositionCommit).toHaveBeenCalledWith({ x: 50, y: 75 });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("recognizes hover from pointer movement when pointer entry is missed", () => {
    const onHoverChange = vi.fn();
    render(<PetSprite {...baseProps} onHoverChange={onHoverChange} />);
    const sprite = screen.getByRole("button", { name: "Move Romeo pet" });

    fireEvent.pointerMove(sprite, { clientX: 80, clientY: 80, pointerId: 1 });
    fireEvent.pointerLeave(sprite);

    expect(onHoverChange.mock.calls).toEqual([[true], [false]]);
  });

  it("moves accessibly with arrow keys", () => {
    const onPositionChange = vi.fn();
    const onPositionCommit = vi.fn();
    render(
      <PetSprite
        {...baseProps}
        onPositionChange={onPositionChange}
        onPositionCommit={onPositionCommit}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Move Romeo pet" }), {
      key: "ArrowRight",
      shiftKey: true,
    });
    expect(onPositionChange).toHaveBeenCalledWith({ x: 72, y: 60 });
    expect(onPositionCommit).toHaveBeenCalledWith({ x: 72, y: 60 });
  });
});
