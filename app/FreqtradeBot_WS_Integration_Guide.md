The deploy button is to just be invoking this   : "const deploymentUrl = `${APA_DOMAIN}/apa/user/${user.email}/${deployStrategyName}?bot_id=${botId}`;"  and that should just trigger handleDeploy function and nothing else it needs to do, it shouldn't even worry about if handle deploy was complete or not, as that must be taken care of by the status updates on the status column on BotList.tsx file. 

## 🔌 WebSocket Architecture

We split the WebSocket responsibilities as follows:

### 1. **Deployment Events WebSocket** (`deploy:event`)
- Listens to live bot deployment lifecycle phases.
- Subscribes via **Socket.IO** under `/socket.io/` on `10xtraders.ai`.
- Events include: `pending`, `deploying`, `running`, `failed`, etc.

### 2. **Runtime Events WebSocket** (`status`, `entry`, etc.)
- Listens to bot runtime metrics like `running`, `ready`, open trades, etc.
- Uses standard `WebSocket` on `wss://<region>.10xtraders.ai/user/<strategyName>/...`.

---

## 🧠 Flow Chart

First, we need such that whenever the user clicks the: Deploy button then the status column changes immediately to  : "Deploying" as it waits for websocket updates so as to update the status accordingly,. 

Second, We need the status column to show like there is some loading of some sort happening whenever the app/components/bots/BotList.tsx loads so that the status colum doesn't not show silent :  "Not Deployed"  stale status before the component is fully mounted, we need like a silent loading paint of some kind like a skeleton bar during initial loading.  We also need to make sure that 

```
Component Mount → Skeleton Loading (subtle pulse)
       ↓
API Response → "Not Deployed" (if no pod exists)  
       ↓
Deploy Click → "🟡 Deploying" (immediate UI update)
       ↓
WebSocket Events → Real-time status updates
       ↓
Backend Ready → "✅ Running" (only when actually ready)


The status column should show elegant skeleton loading states (like app/components/bots/BotDashboard.tsx) instead of spinners, providing a smooth user experience without the jarring "Not Deployed" appearing immediately. 

Thirs, Confirm if this   : "import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiDomain } from '~/lib/api/routing';

interface UseFreqtradeWSOptions {
  strategyName?: string;
  enabled?: boolean;
  eventTypes: string[];
  exchangeName?: string;
  onEvent: (event: { type: string; data: any }) => void;
}

export function useFreqtradeWS({
  strategyName,
  enabled,
  eventTypes,
  exchangeName,
  onEvent,
}: UseFreqtradeWSOptions) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled || !strategyName) return;

    const domain = getApiDomain(exchangeName);
    const socket = io(`${domain}`, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[WS] Connected: ${strategyName}`);
      socket.emit('join', { room: strategyName });
    });

    eventTypes.forEach((type) => {
      socket.on(type, (data) => {
        onEvent({ type, data });
      });
    });

    socket.on('disconnect', (reason) => {
      console.warn(`[WS] Disconnected (${strategyName}):`, reason);
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, strategyName, eventTypes.join(','), exchangeName]);
}
" code is applied else apply it such that **BotList.tsx** sets the **status to "🟡 Deploying" immediately** when the deploy button is clicked. This ensures a smooth transition to WebSocket updates without delay.
2. Removed all internal deployment debug UI elements — **deployment phase/status now only shows in the "Status" column**.
3. All **deployment status updates are WebSocket-driven only**, no polling required.

DON'T CHANGE HOW we are interacting with our import { useFreqtradeWS } from '~/lib/hooks/useFreqtradeWS'; as this is our sole source of websockets.  
```

Deployment WebSockets FYI which is already working from our websockets. 

       Origin: https://10xtraders.ai/socket.io/ (jupyter_proxy)
       Room: namespace = botName = strategyName
       Events: deploy:event with steps (auth → helm → apply → pod → ready)

Runtime WebSocket FYI which is already working from our websockets. 

       Origin: Correct upstream based on exchange
       Path: /user/${namespace}/api/v1/message/ws?token=${user.id}
       Purpose: Live trading metrics and status

Exact API Endpoint Matching FYI which is already working from our websockets. 
       Deploy: /apa/user/${user.email}/${strategyName}?bot_id=${botId} ✅
       Pod Status: /apa/podstatus?botName=${strategyName}&userId=${user.id} ✅
       Pod Logs: /apa/podlogs?botName=${strategyName}&userId=${user.id} ✅
       Delete Pod: /apa/deletepod?botName=${strategyName}&userId=${user.id} ✅



