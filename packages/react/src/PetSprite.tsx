import {
  movePositionForArrowKey,
  type PetFrame,
  type PetPosition,
  type PetSide,
} from "@t3code-pets/core";
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { resolvePetSizeMetrics, type PetSize } from "./petSize.js";

const DRAG_THRESHOLD_PX = 6;

export interface PetSpriteProps {
  readonly name: string;
  readonly atlasUrls: Readonly<Record<PetSide, string>>;
  readonly dragDirection: PetSide | null;
  readonly frame: PetFrame;
  readonly petSize: PetSize;
  readonly position: PetPosition;
  readonly side: PetSide;
  readonly onActivate: () => void;
  readonly onDragDirectionChange: (direction: PetSide | null) => void;
  readonly onHoverChange: (hovered: boolean) => void;
  readonly onPositionChange: (position: PetPosition) => void;
  readonly onPositionCommit: (position: PetPosition) => void;
}

export function PetSprite(props: PetSpriteProps) {
  const drag = useRef<{
    readonly pointerId: number;
    readonly pointerX: number;
    readonly pointerY: number;
    readonly origin: PetPosition;
    direction: PetSide | null;
    lastPointerX: number;
    moved: boolean;
  } | null>(null);
  const dragPosition = useRef(props.position);
  dragPosition.current = props.position;
  const metrics = resolvePetSizeMetrics(props.petSize);

  const spriteStyle: CSSProperties = {
    pointerEvents: "auto",
    left: props.position.x,
    top: props.position.y,
    width: metrics.width,
    height: metrics.height,
    backgroundImage: `url("${
      props.atlasUrls[resolvePetAtlasSide(props.side, props.dragDirection)]
    }")`,
    backgroundSize: `${1536 * metrics.scale}px ${2288 * metrics.scale}px`,
    backgroundPosition: `${-props.frame.column * 192 * metrics.scale}px ${
      -props.frame.row * 208 * metrics.scale
    }px`,
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    drag.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      origin: props.position,
      direction: null,
      lastPointerX: event.clientX,
      moved: false,
    };
    dragPosition.current = props.position;
    props.onHoverChange(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) {
      props.onHoverChange(true);
      return;
    }
    if (drag.current.pointerId !== event.pointerId) return;
    const totalX = event.clientX - drag.current.pointerX;
    const totalY = event.clientY - drag.current.pointerY;
    if (!drag.current.moved) {
      if (Math.hypot(totalX, totalY) < DRAG_THRESHOLD_PX) return;
      drag.current.moved = true;
    }
    const horizontalDelta = event.clientX - drag.current.lastPointerX;
    const nextDirection =
      horizontalDelta === 0
        ? (drag.current.direction ?? (totalX < 0 ? "left" : "right"))
        : horizontalDelta < 0
          ? "left"
          : "right";
    if (drag.current.direction !== nextDirection) {
      drag.current.direction = nextDirection;
      props.onDragDirectionChange(nextDirection);
    }
    drag.current.lastPointerX = event.clientX;
    const next = {
      x: drag.current.origin.x + totalX,
      y: drag.current.origin.y + totalY,
    };
    dragPosition.current = next;
    props.onPositionChange(next);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const moved = drag.current.moved;
    drag.current = null;
    if (moved) {
      props.onDragDirectionChange(null);
      props.onPositionCommit(dragPosition.current);
      return;
    }
    props.onActivate();
  };

  const handlePointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const moved = drag.current.moved;
    drag.current = null;
    if (moved) {
      props.onDragDirectionChange(null);
      props.onPositionCommit(dragPosition.current);
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) props.onActivate();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = movePositionForArrowKey(
      props.position,
      event.key,
      event.shiftKey ? 32 : 8,
    );
    if (!next) return;
    event.preventDefault();
    props.onPositionChange(next);
    props.onPositionCommit(next);
  };

  return (
    <div className="t3pets-overlay" style={{ pointerEvents: "none" }}>
      <button
        aria-label={`Move ${props.name} pet`}
        className="t3pets-sprite"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerOver={() => props.onHoverChange(true)}
        onPointerLeave={() => props.onHoverChange(false)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={spriteStyle}
        type="button"
      />
    </div>
  );
}

export function resolvePetAtlasSide(
  side: PetSide,
  dragDirection: PetSide | null,
): PetSide {
  if (dragDirection === "right") return "left";
  if (dragDirection === "left") return "right";
  return side;
}
