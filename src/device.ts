import { invoke } from "@tauri-apps/api/core";

export interface DeviceInfo {
  id: string;
  name: string;
}

let cached: DeviceInfo | null = null;

/**
 * Returns this machine's stable hardware-bound device identifier (SMBIOS UUID,
 * with a MAC-address fallback) plus a friendly computer name. Used to lock a
 * license to a single desktop. The value is cached for the session.
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (cached) return cached;
  try {
    const info = await invoke<DeviceInfo>("get_device_id");
    cached = {
      id: info?.id || "UNKNOWN-DEVICE",
      name: info?.name || "Unknown PC",
    };
  } catch (e) {
    console.error("Failed to read device id:", e);
    cached = { id: "UNKNOWN-DEVICE", name: "Unknown PC" };
  }
  return cached;
}
