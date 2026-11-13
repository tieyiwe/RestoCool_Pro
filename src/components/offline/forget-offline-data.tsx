"use client";

import { useEffect } from "react";
import { clearStaffOffline } from "@/lib/offline/staff-outbox";

/** Sign-in page and locked tablet: nobody is using the app, so nothing of the previous person stays on the device. */
export function ForgetOfflineData() {
  useEffect(() => {
    try {
      localStorage.removeItem("rc-offline-owner");
    } catch {
      /* ignore */
    }
    void clearStaffOffline();
  }, []);
  return null;
}
