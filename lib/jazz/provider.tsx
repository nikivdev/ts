/**
 * Simplified Jazz Provider for React apps
 */
import { JazzReactProvider } from "jazz-tools/react"
import type { ReactNode } from "react"
import type { AccountSchema } from "jazz-tools"

export interface JazzConfig {
  /** Your account schema (created with defineAccount) */
  accountSchema: AccountSchema<any>
  /** Sync server URL (defaults to Jazz Cloud) */
  syncServer?: string
  /** Storage key for persisting auth (defaults to "jazz-auth") */
  storageKey?: string
  /** Default name for new users */
  defaultName?: string
}

interface Props extends JazzConfig {
  children: ReactNode
}

/**
 * Jazz Provider - wrap your app with this
 *
 * @example
 * ```tsx
 * import { JazzProvider } from "@/lib/jazz"
 * import { MyAccount } from "./schema"
 *
 * function App() {
 *   return (
 *     <JazzProvider
 *       accountSchema={MyAccount}
 *       defaultName="Anonymous User"
 *     >
 *       <YourApp />
 *     </JazzProvider>
 *   )
 * }
 * ```
 */
export function JazzProvider({
  accountSchema,
  syncServer = "wss://cloud.jazz.tools",
  storageKey = "jazz-auth",
  defaultName = "User",
  children,
}: Props) {
  return (
    <JazzReactProvider
      AccountSchema={accountSchema}
      sync={{ peer: syncServer }}
      authSecretStorageKey={storageKey}
      defaultProfileName={defaultName}
    >
      {children}
    </JazzReactProvider>
  )
}

export { JazzReactProvider }
