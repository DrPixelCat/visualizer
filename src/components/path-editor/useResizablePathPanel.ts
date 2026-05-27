"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

const POSE_PANEL_WIDTH_PX = 256;
const SPLITTER_WIDTH_PX = 8;
const FIELD_HORIZONTAL_PADDING_PX = 20;
const FIELD_VERTICAL_PADDING_PX = 16;
const MIN_FIELD_SIZE_PX = 360;
const PATH_PANEL_MIN_WIDTH_PX = 260;
const PATH_PANEL_MAX_WIDTH_PX = 900;

type WorkspaceSize = {
  width: number;
  height: number;
};

type PanelBounds = {
  min: number;
  max: number;
  ideal: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPanelBounds({ width, height }: WorkspaceSize): PanelBounds {
  const availableWidth = Math.max(0, width - POSE_PANEL_WIDTH_PX - SPLITTER_WIDTH_PX);
  const fieldHeightLimit = Math.max(0, height - FIELD_VERTICAL_PADDING_PX);
  const fieldWidthAtMinPanel = Math.max(
    0,
    availableWidth - PATH_PANEL_MIN_WIDTH_PX - FIELD_HORIZONTAL_PADDING_PX,
  );
  const prioritizedFieldSize = Math.min(fieldHeightLimit, fieldWidthAtMinPanel);
  const ideal = availableWidth - prioritizedFieldSize - FIELD_HORIZONTAL_PADDING_PX;
  const maxFromFieldReserve = availableWidth - MIN_FIELD_SIZE_PX - FIELD_HORIZONTAL_PADDING_PX;
  const max = Math.max(0, Math.min(PATH_PANEL_MAX_WIDTH_PX, maxFromFieldReserve));
  const min = Math.min(PATH_PANEL_MIN_WIDTH_PX, max);

  return {
    min,
    max,
    ideal: clamp(ideal, min, max),
  };
}

export function useResizablePathPanel(): {
  workspaceRef: RefObject<HTMLDivElement | null>;
  pathPanelWidth: number;
  isDraggingPathPanel: boolean;
  pathPanelResizeProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
} {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const userSizedRef = useRef(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState<WorkspaceSize>({ width: 0, height: 0 });
  const [pathPanelWidth, setPathPanelWidth] = useState(PATH_PANEL_MIN_WIDTH_PX);
  const [isDraggingPathPanel, setIsDraggingPathPanel] = useState(false);

  const bounds = useMemo(() => getPanelBounds(workspaceSize), [workspaceSize]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setWorkspaceSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (workspaceSize.width <= 0 || workspaceSize.height <= 0) return;

    setPathPanelWidth((current) =>
      userSizedRef.current ? clamp(current, bounds.min, bounds.max) : bounds.ideal,
    );
  }, [bounds, workspaceSize.height, workspaceSize.width]);

  useEffect(() => {
    if (!isDraggingPathPanel) return;

    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const delta = dragState.startX - event.clientX;
      setPathPanelWidth(clamp(dragState.startWidth + delta, bounds.min, bounds.max));
    }

    function handlePointerUp() {
      dragStateRef.current = null;
      setIsDraggingPathPanel(false);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [bounds.max, bounds.min, isDraggingPathPanel]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      userSizedRef.current = true;
      dragStateRef.current = {
        startX: event.clientX,
        startWidth: pathPanelWidth,
      };
      setIsDraggingPathPanel(true);
    },
    [pathPanelWidth],
  );

  return {
    workspaceRef,
    pathPanelWidth,
    isDraggingPathPanel,
    pathPanelResizeProps: {
      onPointerDown: handlePointerDown,
    },
  };
}
