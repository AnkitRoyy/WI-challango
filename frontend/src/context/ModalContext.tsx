import React, { createContext, useContext, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";

interface ModalContextType {
  isAddEntryOpen: boolean;
  openAddEntry: () => void;
  closeAddEntry: () => void;
  /** True when the user has typed something in the new-entry form */
  hasUnsavedDraft: boolean;
  setHasUnsavedDraft: (v: boolean) => void;
}

const ModalContext = createContext<ModalContextType>({
  isAddEntryOpen: false,
  openAddEntry: () => {},
  closeAddEntry: () => {},
  hasUnsavedDraft: false,
  setHasUnsavedDraft: () => {},
});

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const location = useLocation();

  // Close modal whenever the route changes
  const prevPath = React.useRef(location.pathname);
  React.useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      // Close without confirmation — navigation is intentional
      setIsAddEntryOpen(false);
      setHasUnsavedDraft(false);
    }
  }, [location.pathname]);

  const openAddEntry = useCallback(() => {
    setHasUnsavedDraft(false);
    setIsAddEntryOpen(true);
  }, []);

  const closeAddEntry = useCallback(() => {
    setIsAddEntryOpen(false);
    setHasUnsavedDraft(false);
  }, []);

  return (
    <ModalContext.Provider
      value={{
        isAddEntryOpen,
        openAddEntry,
        closeAddEntry,
        hasUnsavedDraft,
        setHasUnsavedDraft,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};

export const useEntryModal = () => useContext(ModalContext);
