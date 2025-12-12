/**
 * Simplified schema definitions for Jazz
 * Re-exports the `co` builder with some convenience wrappers
 */
import { co, z, Group, type ID } from "jazz-tools"

export { co, z }

/** Create a simple item schema (CoMap with fields) */
export function defineItem<T extends Record<string, unknown>>(
  shape: T
) {
  return co.map(shape as any)
}

/** Create a list of items */
export function defineList<T>(itemSchema: T) {
  return co.list(itemSchema as any)
}

/** Create an account with profile and root data */
export function defineAccount<
  P extends Record<string, unknown>,
  R extends Record<string, unknown>
>(config: { profile?: P; root: R }) {
  return co.account({
    profile: co.profile(config.profile || {}),
    root: co.map(config.root as any),
  } as any)
}

/** Create a permission group */
export function createGroup(owner: { $jazz: { owner: Group } }) {
  return Group.create({ owner: owner.$jazz.owner })
}

/** Type helper for loaded schema instances */
export type Loaded<T> = co.loaded<T>

/** Re-export ID type */
export type { ID }
