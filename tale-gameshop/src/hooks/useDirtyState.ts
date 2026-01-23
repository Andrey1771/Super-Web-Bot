import { useCallback, useContext, useEffect, useState } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";

type BlockerTransaction = {
  retry: () => void;
};

const useBlocker = (blocker: (tx: BlockerTransaction) => void, when = true) => {
  const { navigator } = useContext(UNSAFE_NavigationContext);

  useEffect(() => {
    if (!when) {
      return;
    }

    const unblock = (navigator as any).block((tx: BlockerTransaction) => {
      const autoUnblockTx = {
        ...tx,
        retry() {
          unblock();
          tx.retry();
        },
      };
      blocker(autoUnblockTx);
    });

    return unblock;
  }, [navigator, blocker, when]);
};

type UseDirtyStateOptions = {
  when: boolean;
  message?: string;
};

export const useDirtyState = (isDirty: boolean, options?: UseDirtyStateOptions) => {
  const [dirty, setDirty] = useState(isDirty);
  const shouldBlock = options?.when ?? dirty;
  const message = options?.message ?? "You have unsaved changes. Leave anyway?";

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty]);

  const blocker = useCallback(
    (tx: BlockerTransaction) => {
      const proceed = window.confirm(message);
      if (proceed) {
        tx.retry();
      }
    },
    [message]
  );

  useBlocker(blocker, shouldBlock);

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
