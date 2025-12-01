// src/lib/hooks/useK8sStatusWS.ts
import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

type Params = {
  namespaces: string[];
  enabled?: boolean;
  onEvent: (ev: any) => void;
};

let sharedSocket: Socket | null = null;
function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io("https://10xtraders.ai", {
      path: "/apa/socket.io",
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
    });
  }
  return sharedSocket;
}

export function useK8sStatusWS({ namespaces, enabled = true, onEvent }: Params) {
  const namesRef = useRef<string[]>([]);
  namesRef.current = (namespaces || []).filter(Boolean);

  useEffect(() => {
    if (!enabled || namesRef.current.length === 0) return;

    const s = getSocket();

    const handleEvent = (msg: any) => {
      if (msg?.type === "status:event") onEvent(msg);
    };

    const subscribeAll = () => {
      if (namesRef.current.length > 0) {
        s.emit("status:bulk_subscribe", { namespaces: namesRef.current });
      }
    };

    // subscribe on connect (initial + every reconnect)
    s.on("connect", subscribeAll);
    // also attempt immediately (socket.io will buffer if still connecting)
    subscribeAll();

    s.on("status:event", handleEvent);

    return () => {
      s.off("connect", subscribeAll);
      s.off("status:event", handleEvent);
      // optional hygiene: explicitly unsubscribe current set
      namesRef.current.forEach(ns => s.emit("status:unsubscribe", { namespace: ns }));
    };
  }, [enabled, JSON.stringify(namespaces)]);
}
