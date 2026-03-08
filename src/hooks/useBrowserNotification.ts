import { useCallback, useEffect, useRef } from "react";

/**
 * Hook to send browser notifications.
 * Requests permission on first call, then sends notifications.
 */
export function useBrowserNotification() {
  const permissionRef = useRef<NotificationPermission>("default");

  useEffect(() => {
    if ("Notification" in window) {
      permissionRef.current = Notification.permission;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    permissionRef.current = result;
    return result === "granted";
  }, []);

  const notify = useCallback(
    async (title: string, options?: NotificationOptions) => {
      if (!("Notification" in window)) return;
      const granted = await requestPermission();
      if (!granted) return;
      try {
        const n = new Notification(title, {
          icon: "/favicon.png",
          badge: "/favicon.png",
          ...options,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
        return n;
      } catch {
        // Silent fail on environments that don't support Notification constructor
      }
    },
    [requestPermission]
  );

  return { notify, requestPermission, isSupported: "Notification" in window };
}
