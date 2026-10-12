import type { KeyboardEvent } from "react";

/** Elements where Enter should keep its own meaning instead of saving. */
function keepsOwnEnter(target: HTMLElement) {
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName === "BUTTON" && (target as HTMLButtonElement).type === "submit") return true;
  // menus / destructive actions (apagar) keep their own Enter
  if (target.closest("[role='menu'],[role='menuitem'],[data-enter-own]")) return true;
  return false;
}

/**
 * Enter anywhere inside the window (inputs, chips, repetition buttons, tags)
 * runs the same save as the save button, including its validation.
 */
export function submitOnEnter(save: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter" || e.defaultPrevented || e.shiftKey || e.nativeEvent.isComposing) return;
    if (keepsOwnEnter(e.target as HTMLElement)) return;
    e.preventDefault();
    save();
  };
}

/** Same as submitOnEnter for a <form>: submits through onSubmit (same validation). */
export function submitFormOnEnter(e: KeyboardEvent<HTMLFormElement>) {
  submitOnEnter(() => e.currentTarget.requestSubmit())(e);
}
