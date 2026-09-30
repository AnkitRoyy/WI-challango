import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { notifications } from "@mantine/notifications";
import { useDarkTokens } from "./useDarkTokens";

interface NativeHandlerOptions {
  isModalOpen?: boolean;
  closeModal?: () => void;
  isDrawerOpen?: boolean;
  closeDrawer?: () => void;
}

export function useCapacitorNative({
  isModalOpen = false,
  closeModal,
  isDrawerOpen = false,
  closeDrawer,
}: NativeHandlerOptions = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useDarkTokens();

  // Status Bar handling
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const configureStatusBar = async () => {
      try {
        if (t.isDark) {
          // Dark mode: True black background (#000000), white status bar icons
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: "#000000" });
        } else {
          // Light mode: Blue background (#2563EB), white status bar icons
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: "#2563EB" });
        }
      } catch (err) {
        console.warn("StatusBar configuration failed:", err);
      }
    };

    configureStatusBar();
  }, [t.isDark]);

  // Android Hardware / Gesture Back Button handling
  const lastBackPressRef = useRef<number>(0);
  const stateRef = useRef({
    isModalOpen,
    closeModal,
    isDrawerOpen,
    closeDrawer,
    pathname: location.pathname,
  });

  // Keep stateRef in sync with current render
  useEffect(() => {
    stateRef.current = {
      isModalOpen,
      closeModal,
      isDrawerOpen,
      closeDrawer,
      pathname: location.pathname,
    };
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapApp.addListener("backButton", () => {
      const {
        isModalOpen: modalOpen,
        closeModal: closeM,
        isDrawerOpen: drawerOpen,
        closeDrawer: closeD,
        pathname,
      } = stateRef.current;

      // 1. If Drawer is open, dismiss it
      if (drawerOpen && closeD) {
        closeD();
        return;
      }

      // 2. If Entry Modal is open, dismiss it
      if (modalOpen && closeM) {
        closeM();
        return;
      }

      // 3. If on main screens (/entries or /login), handle "Press back again to exit"
      if (pathname === "/entries" || pathname === "/" || pathname === "/login") {
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          CapApp.exitApp();
        } else {
          lastBackPressRef.current = now;
          notifications.show({
            id: "exit-app-confirm",
            message: "Press back again to exit",
            color: "gray",
            autoClose: 2000,
            withCloseButton: false,
          });
        }
        return;
      }

      // 4. On any other route (e.g. /admin/products, /admin/analytics, /import), navigate back
      navigate(-1);
    });

    return () => {
      listener.then((sub) => sub.remove());
    };
  }, [navigate]);
}
