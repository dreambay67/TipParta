"use client";

import { useRef, type DragEvent, type MouseEvent, type TouchEvent } from "react";

type DragState = {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  dragged: boolean;
};

type DragAxis = "x" | "y" | "both";

type UseDragScrollOptions = {
  axis?: DragAxis;
};

function shouldIgnoreDrag(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button,a,input,textarea,select,label"));
}

export function useDragScroll<T extends HTMLElement>(options: UseDragScrollOptions = {}) {
  const axis = options.axis ?? "both";
  const ref = useRef<T | null>(null);
  const stateRef = useRef<DragState | null>(null);

  const beginDrag = (clientX: number, clientY: number, target: EventTarget | null) => {
    if (shouldIgnoreDrag(target)) {
      return false;
    }

    const element = ref.current;
    if (!element) {
      return false;
    }

    const canScrollX = element.scrollWidth > element.clientWidth;
    const canScrollY = element.scrollHeight > element.clientHeight;
    if ((axis === "x" && !canScrollX) || (axis === "y" && !canScrollY) || (axis === "both" && !canScrollX && !canScrollY)) {
      return false;
    }

    stateRef.current = {
      dragged: false,
      startX: clientX,
      startY: clientY,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop
    };
    element.classList.add("drag-scroll--dragging");
    return true;
  };

  const moveDrag = (clientX: number, clientY: number) => {
    const state = stateRef.current;
    const element = ref.current;
    if (!state || !element) {
      return;
    }

    const deltaX = clientX - state.startX;
    const deltaY = clientY - state.startY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      state.dragged = true;
    }

    if (axis === "x" || axis === "both") {
      element.scrollLeft = state.scrollLeft - deltaX;
    }
    if (axis === "y" || axis === "both") {
      element.scrollTop = state.scrollTop - deltaY;
    }
  };

  const endDrag = () => {
    ref.current?.classList.remove("drag-scroll--dragging");
    stateRef.current = null;
  };

  const onMouseDown = (event: MouseEvent<T>) => {
    if (event.button !== 0 || !beginDrag(event.clientX, event.clientY, event.target)) {
      return;
    }

    event.preventDefault();

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      moveDrag(moveEvent.clientX, moveEvent.clientY);
      moveEvent.preventDefault();
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      endDrag();
    };

    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp);
  };

  const onTouchStart = (event: TouchEvent<T>) => {
    const touch = event.touches[0];
    if (!touch || !beginDrag(touch.clientX, touch.clientY, event.target)) {
      return;
    }

    const onTouchMove = (moveEvent: globalThis.TouchEvent) => {
      const nextTouch = moveEvent.touches[0];
      if (!nextTouch || !stateRef.current) {
        return;
      }
      moveDrag(nextTouch.clientX, nextTouch.clientY);
      if (stateRef.current.dragged) {
        moveEvent.preventDefault();
      }
    };
    const onTouchEnd = () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      endDrag();
    };

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
  };

  return {
    ref,
    onDragStart: (event: DragEvent<T>) => event.preventDefault(),
    onMouseDown,
    onTouchStart
  };
}
