import type { CoMap, CoList, Account, Group, ID } from "jazz-tools"

/** Simplified ID type */
export type ItemId<T = unknown> = ID<T>

/** Basic item that can be stored */
export interface Item {
  id: ItemId
}

/** CRUD operation result */
export type CrudResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/** Loading state for async operations */
export type LoadState<T> =
  | { status: "loading" }
  | { status: "loaded"; data: T }
  | { status: "error"; error: string }

/** Permission roles */
export type Role = "reader" | "writer" | "admin"

/** Store configuration */
export interface StoreConfig {
  /** Sync server URL (default: wss://cloud.jazz.tools) */
  sync?: string
  /** Storage key for auth */
  authKey?: string
  /** Default profile name for new users */
  defaultName?: string
}

/** Re-export jazz types we still need to expose */
export type { CoMap, CoList, Account, Group, ID }
