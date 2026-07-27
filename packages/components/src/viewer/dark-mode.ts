import { useEffect, useState } from "react";

/** Whether the app is rendering in dark mode, probed from the DOM at call time. */
export function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  return (
    root.classList.contains("dark") ||
    root.getAttribute("data-theme") === "dark" ||
    document.querySelector(".radix-themes")?.classList.contains("dark") === true
  );
}

/** Watch for a theme flip via `class`/`data-theme` mutations on the documentElement and the Radix
 *  theme root; returns an unsubscribe function. */
export function observeThemeChange(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  const opts = { attributes: true, attributeFilter: ["class", "data-theme"] };
  obs.observe(document.documentElement, opts);
  const themed = document.querySelector(".radix-themes");
  if (themed && themed !== document.documentElement) obs.observe(themed, opts);
  return () => obs.disconnect();
}

/** Reactive `isDarkMode()`; a bare call in render would freeze at the theme when the component mounted. */
export function useIsDarkMode(): boolean {
  const [dark, setDark] = useState(isDarkMode);
  useEffect(() => {
    const update = () => setDark(isDarkMode());
    update();
    return observeThemeChange(update);
  }, []);
  return dark;
}
