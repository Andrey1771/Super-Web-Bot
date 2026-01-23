import { useEffect, useState } from "react";
import { unstable_useBlocker as useBlocker } from "react-router-dom";

type UseDirtyStateOptions = {
  when: boolean;
  message?: string;
};

export const useDirtyState = (isDirty: boolean, options?: UseDirtyStateOptions) => {
  const [dirty, setDirty] = useState(isDirty);
  const shouldBlock = options?.when ?? dirty;
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty]);

  useEffect(() => {
    if (!blocker.state || blocker.state !== "blocked") {
      return;
    }

    const proceed = window.confirm(options?.message ?? "You have unsaved changes. Leave anyway?");
    if (proceed) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, options?.message]);

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
