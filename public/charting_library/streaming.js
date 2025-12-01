import { parseFullSymbol } from './helpers.js';

const channelToSubscription = new Map();
let socket = null;
let reconnectAttempts = 0;

const BINANCE_WS_BASE_URL = "wss://fstream.binance.com/ws/"; // ✅ Binance Futures WebSocket

function initSocket(symbol) {
  if (socket && socket.readyState === WebSocket.OPEN) return;

  const lowerSymbol = symbol.toLowerCase();
  const binanceWsUrl = `${BINANCE_WS_BASE_URL}${lowerSymbol}@aggTrade`; // ✅ Correct stream format

  console.log(`[socket] Connecting to Binance WebSocket: ${binanceWsUrl}`);
  socket = new WebSocket(binanceWsUrl);

  socket.onopen = () => {
    console.log('[socket] Connected to Binance WebSocket');
    reconnectAttempts = 0;

    // ✅ Resubscribe only when WebSocket is open
    channelToSubscription.forEach((_, channelString) => {
      console.log(`[socket] Resubscribing to ${channelString}`);
      sendSubscriptionRequest(channelString);
    });
  };

  socket.onclose = () => {
    reconnectAttempts++;
    const delay = Math.min(30000, reconnectAttempts * 2000);
    console.log(`[socket] Disconnected. Reconnecting in ${delay / 1000} seconds...`);
    setTimeout(() => initSocket(symbol), delay);
  };

  socket.onerror = (error) => {
    console.error('[socket] WebSocket Error:', error);
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('[socket] Raw message received:', data);

    if (!data.s || data.e !== "aggTrade") return; // ✅ Ensure event is a trade update

    const channelString = `${data.s.toLowerCase()}@aggTrade`;
    console.log('[socket] Processing trade message for:', channelString);

    const subscriptionItem = channelToSubscription.get(channelString);
    if (!subscriptionItem) return;

    const tradePrice = parseFloat(data.p);
    const tradeTime = Math.floor(data.T / 1000);
    console.log(`[socket] Trade update - Price: ${tradePrice}, Time: ${tradeTime}`);

    const lastBar = subscriptionItem.lastDailyBar || {
      time: tradeTime * 1000,
      open: tradePrice,
      high: tradePrice,
      low: tradePrice,
      close: tradePrice,
    };

    let bar = { ...lastBar };
    if (tradeTime >= getNextDailyBarTime(lastBar.time)) {
      bar = {
        time: tradeTime * 1000,
        open: tradePrice,
        high: tradePrice,
        low: tradePrice,
        close: tradePrice,
      };
      console.log('[socket] New daily bar generated:', bar);
    } else {
      bar.high = Math.max(lastBar.high, tradePrice);
      bar.low = Math.min(lastBar.low, tradePrice);
      bar.close = tradePrice;
      console.log('[socket] Updated existing bar:', bar);
    }

    subscriptionItem.lastDailyBar = bar;
    subscriptionItem.handlers.forEach(handler => handler.callback(bar));
  };
}

function sendSubscriptionRequest(channelString) {
  if (channelToSubscription.has(channelString)) {
    console.log(`[socket] Already subscribed to ${channelString}`);
    return;
  }

  if (socket.readyState === WebSocket.OPEN) {
    console.log(`[socket] Subscribed successfully to ${channelString}`);
  } else {
    console.log('[socket] WebSocket not open. Subscription delayed.');
    setTimeout(() => sendSubscriptionRequest(channelString), 500);
  }
}

function getNextDailyBarTime(barTime) {
  const date = new Date(barTime * 1000);
  date.setDate(date.getDate() + 1);
  return Math.floor(date.getTime() / 1000);
}

export function subscribeOnStream(symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback, lastDailyBar) {
//   const parsedSymbol = parseFullSymbol(symbolInfo.full_name);
  const parsedSymbol = symbolInfo.name;
  console.log(`[streaming] Subscribing to: ${parsedSymbol}`);
  const lowerSymbol = `${parsedSymbol.toLowerCase()}`;

  console.log(`[streaming] Subscribing to: ${lowerSymbol}`);
  console.log(`[socket] Connecting to Binance WebSocket for symbol: ${lowerSymbol}`);

  initSocket(lowerSymbol); // ✅ Ensure WebSocket connects to the correct symbol

  const channelString = `${lowerSymbol}@aggTrade`;

  const handler = { id: subscriberUID, callback: onRealtimeCallback };
  channelToSubscription.set(channelString, {
    subscriberUID,
    resolution,
    lastDailyBar,
    handlers: [handler],
  });
}

export function unsubscribeFromStream(subscriberUID) {
  for (const [channelString, subscriptionItem] of channelToSubscription.entries()) {
    if (subscriptionItem.subscriberUID === subscriberUID) {
      console.log(`[unsubscribeBars] Unsubscribing from ${channelString}`);
      channelToSubscription.delete(channelString);
    }
  }
}
