import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "../ui";

export type PageAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
};

type DashboardActionOverflowProps = {
  actions: PageAction[];
  pageTitle: string;
  readOnly?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
  menuClassName?: string;
  iconSize?: "sm" | "md";
};

type MenuPosition = {
  left: number;
  top: number;
  width: number;
};

const MENU_WIDTH = 240;
const MENU_GAP = 6;
const VIEWPORT_GUTTER = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}

export default function DashboardActionOverflow({
  actions,
  pageTitle,
  readOnly = false,
  triggerLabel,
  triggerClassName,
  menuClassName,
  iconSize = "sm",
}: DashboardActionOverflowProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const instanceId = useId().replace(/:/g, "");
  const menuId = `actions-menu-${instanceId}`;
  const triggerId = `actions-trigger-${instanceId}`;
  const ariaLabel = `Mais ações de ${pageTitle}`;

  const getMenuPosition = useCallback((measuredWidth = MENU_WIDTH, measuredHeight = Math.max(44, actions.length * 40 + 12)) => {
    const trigger = actionsButtonRef.current;
    if (!trigger) return null;

    const triggerRect = trigger.getBoundingClientRect();
    const availableWidth = Math.max(1, window.innerWidth - VIEWPORT_GUTTER * 2);
    const width = Math.min(measuredWidth, availableWidth);
    const maximumLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER);
    const left = clamp(triggerRect.right - width, VIEWPORT_GUTTER, maximumLeft);
    const below = triggerRect.bottom + MENU_GAP;
    const above = triggerRect.top - measuredHeight - MENU_GAP;
    const fitsBelow = below + measuredHeight <= window.innerHeight - VIEWPORT_GUTTER;
    const fitsAbove = above >= VIEWPORT_GUTTER;
    const preferredTop = fitsBelow || !fitsAbove ? below : above;
    const maximumTop = Math.max(VIEWPORT_GUTTER, window.innerHeight - measuredHeight - VIEWPORT_GUTTER);

    return { left, top: clamp(preferredTop, VIEWPORT_GUTTER, maximumTop), width };
  }, [actions.length]);

  const enabledMenuItems = useCallback(
    () => menuItemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled)),
    [],
  );

  const focusMenuItem = useCallback((index: number) => {
    const items = enabledMenuItems();
    if (items.length === 0) return;
    items[clamp(index, 0, items.length - 1)]?.focus({ preventScroll: true });
  }, [enabledMenuItems]);

  const focusFirstMenuItem = useCallback(() => {
    focusMenuItem(0);
  }, [focusMenuItem]);

  const updateMenuPosition = useCallback(() => {
    const menu = menuRef.current;
    const nextPosition = getMenuPosition(menu?.offsetWidth || MENU_WIDTH, menu?.offsetHeight || Math.max(44, actions.length * 40 + 12));
    if (!nextPosition) return;
    setMenuPosition((current) => (
      current?.left === nextPosition.left && current.top === nextPosition.top && current.width === nextPosition.width
        ? current
        : nextPosition
    ));
  }, [actions.length, getMenuPosition]);

  const closeActionsMenu = useCallback((restoreFocus = false) => {
    setIsActionsOpen(false);
    if (restoreFocus) actionsButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const openActionsMenu = useCallback(() => {
    const nextPosition = getMenuPosition();
    if (nextPosition) setMenuPosition(nextPosition);
    setIsActionsOpen(true);
    window.requestAnimationFrame(() => {
      if (!menuRef.current) return;
      updateMenuPosition();
      focusFirstMenuItem();
    });
  }, [focusFirstMenuItem, getMenuPosition, updateMenuPosition]);

  useEffect(() => {
    if (!isActionsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!actionsButtonRef.current?.contains(target) && !menuRef.current?.contains(target)) closeActionsMenu();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeActionsMenu(true);
      }
    }
    function handleViewportChange() {
      updateMenuPosition();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [closeActionsMenu, isActionsOpen, updateMenuPosition]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      closeActionsMenu();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeActionsMenu(true);
      return;
    }

    const items = enabledMenuItems();
    if (items.length === 0) return;
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuItem(currentIndex < 0 ? 0 : (currentIndex + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusMenuItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusMenuItem(items.length - 1);
    }
  }

  const menu = isActionsOpen && typeof document !== "undefined"
    ? createPortal(
      <div
        aria-labelledby={triggerId}
        className={`page-actions-menu fixed z-[180] w-60 max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border p-1.5 shadow-lg ${menuClassName ?? ""}`}
        data-action-overflow-menu
        id={menuId}
        onKeyDown={handleMenuKeyDown}
        ref={menuRef}
        role="menu"
        style={menuPosition
          ? { left: menuPosition.left, top: menuPosition.top, width: menuPosition.width }
          : { left: VIEWPORT_GUTTER, top: VIEWPORT_GUTTER, visibility: "hidden" }}
      >
        {actions.map((action, index) => (
          <button
            aria-disabled={readOnly || action.disabled || undefined}
            className="page-action-item flex min-h-9 w-full items-center rounded-md px-2.5 py-2 text-left text-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]"
            disabled={readOnly || action.disabled}
            key={action.label}
            onClick={() => {
              action.onClick?.();
              closeActionsMenu();
            }}
            ref={(node) => {
              menuItemRefs.current[index] = node;
            }}
            role="menuitem"
            tabIndex={-1}
            title={action.title}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <div className="relative" data-action-overflow>
      {triggerLabel ? (
        <Button
          aria-controls={isActionsOpen ? menuId : undefined}
          aria-expanded={isActionsOpen}
          aria-haspopup="menu"
          aria-label={ariaLabel}
          className={triggerClassName}
          disabled={readOnly}
          id={triggerId}
          onClick={() => (isActionsOpen ? closeActionsMenu() : openActionsMenu())}
          ref={actionsButtonRef}
          rightIcon={<MoreHorizontal size={14} />}
          size="md"
          variant="secondary"
        >
          {triggerLabel}
        </Button>
      ) : (
        <IconButton
          aria-controls={isActionsOpen ? menuId : undefined}
          aria-expanded={isActionsOpen}
          aria-haspopup="menu"
          aria-label={ariaLabel}
          className={triggerClassName}
          disabled={readOnly}
          id={triggerId}
          onClick={() => (isActionsOpen ? closeActionsMenu() : openActionsMenu())}
          ref={actionsButtonRef}
          size={iconSize}
          variant="secondary"
        >
          <MoreHorizontal size={iconSize === "md" ? 16 : 14} />
        </IconButton>
      )}
      </div>
      {menu}
    </>
  );
}
