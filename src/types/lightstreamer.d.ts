// Lightstreamer 由 index.html 的 <script> 載入（全域變數），這裡只宣告用到的部分
interface LsItemUpdate {
  getItemName(): string
  getValue(field: string): string | null
}

interface LsSubscription {
  addListener(listener: {
    onSubscription?: () => void
    onSubscriptionError?: (code: number, msg: string) => void
    onItemUpdate?: (u: LsItemUpdate) => void
  }): void
}

interface LsClient {
  addListener(listener: {
    onStatusChange?: (status: string) => void
    onServerError?: (code: number, msg: string) => void
  }): void
  subscribe(sub: LsSubscription): void
  unsubscribe(sub: LsSubscription): void
  connect(): void
  disconnect(): void
}

interface Window {
  LightstreamerClient?: new (serverAddress: string, adapterSet: string) => LsClient
  Subscription?: new (mode: string, items: string[], fields: string[]) => LsSubscription
}
