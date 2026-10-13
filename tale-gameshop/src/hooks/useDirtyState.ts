import { useCallback, useEffect, useRef, useState } from "react";

type UseDirtyStateOptions = {
  when: boolean;
  message?: string;
};

export const useDirtyState = (isDirty: boolean, options?: UseDirtyStateOptions) => {
  const [dirty, setDirty] = useState(isDirty);
  const message = options?.message ?? "You have unsaved changes. Leave anyway?";
  const previousPathRef = useRef<string>(window.location.pathname + window.location.search);

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty]);

  const shouldBlock = options?.when ?? dirty;

  const confirmNavigation = useCallback(() => {
    return window.confirm(message);
  }, [message]);

  useEffect(() => {
    if (!shouldBlock) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) {
        return;
      }
      const proceed = confirmNavigation();
      if (!proceed) {
        event.preventDefault();
      }
    };

    const handlePopState = () => {
      const proceed = confirmNavigation();
      if (!proceed) {
        window.history.pushState(null, "", previousPathRef.current);
      } else {
        previousPathRef.current = window.location.pathname + window.location.search;
      }
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = (...args) => {
      if (!confirmNavigation()) {
        return;
      }
      originalPushState(...args);
      previousPathRef.current = window.location.pathname + window.location.search;
    };

    window.history.replaceState = (...args) => {
      if (!confirmNavigation()) {
        return;
      }
      originalReplaceState(...args);
      previousPathRef.current = window.location.pathname + window.location.search;
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [confirmNavigation, shouldBlock]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  return { dirty, setDirty };
};
