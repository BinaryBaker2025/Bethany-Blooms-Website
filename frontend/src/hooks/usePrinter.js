import { useCallback, useEffect, useRef, useState } from "react";
import { buildBillCommands, buildReceiptCommands } from "../lib/escpos.js";

// Send data in small chunks — most thermal printers have a 64-byte USB buffer
const CHUNK_SIZE = 64;

async function sendBytes(device, endpointNumber, bytes) {
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    await device.transferOut(endpointNumber, bytes.slice(offset, offset + CHUNK_SIZE));
  }
}

function findOutEndpoint(device) {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        for (const ep of alt.endpoints) {
          if (ep.direction === "out") {
            return { interfaceNumber: iface.interfaceNumber, endpointNumber: ep.endpointNumber };
          }
        }
      }
    }
  }
  return null;
}

export function usePrinter() {
  const deviceRef = useRef(null);
  const endpointRef = useRef(null);
  const [status, setStatus] = useState("disconnected");

  // Auto-disconnect when the cable is pulled
  useEffect(() => {
    if (!navigator.usb) return;
    const handler = (e) => {
      if (e.device === deviceRef.current) {
        deviceRef.current = null;
        endpointRef.current = null;
        setStatus("disconnected");
      }
    };
    navigator.usb.addEventListener("disconnect", handler);
    return () => navigator.usb.removeEventListener("disconnect", handler);
  }, []);

  const connect = useCallback(async () => {
    if (!navigator.usb) {
      throw new Error("WebUSB is not supported in this browser. Use Chrome or Edge.");
    }

    let device;
    try {
      device = await navigator.usb.requestDevice({ filters: [] });
    } catch (err) {
      // User dismissed the picker — not an error worth surfacing
      if (err.name === "NotFoundError") return false;
      throw err;
    }

    try {
      await device.open();
    } catch {
      throw new Error("Could not open the printer. Try unplugging and reconnecting it.");
    }

    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    const ep = findOutEndpoint(device);
    if (!ep) {
      await device.close().catch(() => {});
      throw new Error("No output endpoint found. This may not be a supported printer.");
    }

    try {
      await device.claimInterface(ep.interfaceNumber);
    } catch {
      await device.close().catch(() => {});
      throw new Error(
        "Could not claim the printer interface. On Android, try unplugging, " +
        "reconnecting, and selecting 'Allow' when prompted.",
      );
    }

    deviceRef.current = device;
    endpointRef.current = ep;
    setStatus("connected");
    return true;
  }, []);

  const disconnect = useCallback(async () => {
    if (deviceRef.current) {
      try {
        await deviceRef.current.close();
      } catch {}
      deviceRef.current = null;
      endpointRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  const print = useCallback(
    async (receiptData, formatCurrency) => {
      if (!deviceRef.current || !endpointRef.current) {
        throw new Error("Printer not connected.");
      }
      setStatus("printing");
      try {
        const cmd = buildReceiptCommands(receiptData, formatCurrency);
        await sendBytes(deviceRef.current, endpointRef.current.endpointNumber, cmd.bytes());
        setStatus("connected");
      } catch (err) {
        // If the device was unplugged mid-print the ref is stale
        deviceRef.current = null;
        endpointRef.current = null;
        setStatus("disconnected");
        throw err;
      }
    },
    [],
  );

  const printBill = useCallback(
    async (cartItems, subtotal, tableLabel, formatCurrency) => {
      if (!deviceRef.current || !endpointRef.current) {
        throw new Error("Printer not connected.");
      }
      setStatus("printing");
      try {
        const cmd = buildBillCommands(cartItems, subtotal, tableLabel, formatCurrency);
        await sendBytes(deviceRef.current, endpointRef.current.endpointNumber, cmd.bytes());
        setStatus("connected");
      } catch (err) {
        deviceRef.current = null;
        endpointRef.current = null;
        setStatus("disconnected");
        throw err;
      }
    },
    [],
  );

  return { status, connect, disconnect, print, printBill };
}
