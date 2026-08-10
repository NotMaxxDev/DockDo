export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers = new Map<string, Set<(data: Record<string, unknown>) => void>>();
  private subscribed = new Set<string>();
  private retryTimeout: number | null = null;
  private closedByUser = false;

  constructor() {
    this.url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.closedByUser = false;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      return;
    }
    this.ws.onopen = () => {
      this.subscribed.forEach((listId) => this.send({ type: 'subscribe', listId }));
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        const hs = this.handlers.get(msg.type);
        if (hs) hs.forEach((h) => h(msg));
      } catch {
        /* ignore */
      }
    };
    this.ws.onclose = () => {
      if (!this.closedByUser) {
        this.retryTimeout = window.setTimeout(() => this.connect(), 3000);
      }
    };
  }

  on(type: string, handler: (data: Record<string, unknown>) => void): () => void {
    let hs = this.handlers.get(type);
    if (!hs) {
      hs = new Set();
      this.handlers.set(type, hs);
    }
    hs.add(handler);
    return () => hs.delete(handler);
  }

  subscribe(listId: string): void {
    this.subscribed.add(listId);
    this.send({ type: 'subscribe', listId });
  }

  unsubscribe(listId: string): void {
    this.subscribed.delete(listId);
    this.send({ type: 'unsubscribe', listId });
  }

  send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }

  close(): void {
    this.closedByUser = true;
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WsClient();