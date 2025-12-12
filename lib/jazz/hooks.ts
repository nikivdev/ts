/**
 * Simplified CRUD hooks for Jazz in React
 */
import { useCallback, useMemo } from "react"
import {
  useCoState,
  useAccount,
  useLogOut,
  useSyncConnectionStatus,
  type CoValueClassOrSchema,
  type ResolveQuery,
  Group,
} from "jazz-tools/react"

export { useAccount, useLogOut, useSyncConnectionStatus }

type ResolveOption<S> = ResolveQuery<S>

/**
 * Read a single item by ID
 *
 * @example
 * const todo = useItem(TodoSchema, todoId)
 * if (!todo.$isLoaded) return <Loading />
 * return <div>{todo.title}</div>
 */
export function useItem<S extends CoValueClassOrSchema>(
  schema: S,
  id: string | undefined,
  options?: { resolve?: ResolveOption<S> }
) {
  return useCoState(schema, id, options as any)
}

/**
 * Read a list of items
 *
 * @example
 * const todos = useList(TodoListSchema, listId, { resolve: { $each: true } })
 */
export function useList<S extends CoValueClassOrSchema>(
  schema: S,
  id: string | undefined,
  options?: { resolve?: ResolveOption<S> }
) {
  return useCoState(schema, id, options as any)
}

/**
 * Get the current user's account with their root data
 *
 * @example
 * const { me } = useMe(MyAccount, { resolve: { root: true } })
 */
export function useMe<S extends CoValueClassOrSchema>(
  schema: S,
  options?: { resolve?: ResolveOption<S> }
) {
  const account = useAccount(schema as any, options as any)
  return { me: account, isLoaded: account.$isLoaded }
}

/**
 * CRUD operations hook - provides create, update, delete functions
 *
 * @example
 * const { create, update, remove } = useCrud(TodoSchema)
 *
 * // Create
 * const newTodo = create({ title: "New task", done: false }, owner)
 *
 * // Update
 * update(todo, { title: "Updated title" })
 *
 * // Delete (from a list)
 * remove(todoList, index)
 */
export function useCrud<S extends CoValueClassOrSchema>(schema: S) {
  type SchemaType = S extends { create: (data: infer D, opts: any) => any }
    ? D
    : Record<string, unknown>

  const create = useCallback(
    (
      data: SchemaType,
      owner: { $jazz: { owner: Group } } | Group
    ) => {
      const ownerGroup = "$jazz" in owner ? owner.$jazz.owner : owner
      return (schema as any).create(data, { owner: ownerGroup })
    },
    [schema]
  )

  const update = useCallback(
    <T extends Record<string, unknown>>(item: T, updates: Partial<T>) => {
      for (const [key, value] of Object.entries(updates)) {
        ;(item as any)[key] = value
      }
    },
    []
  )

  const remove = useCallback(
    <T extends { $jazz: { splice: (idx: number, count: number) => void } }>(
      list: T,
      index: number
    ) => {
      list.$jazz.splice(index, 1)
    },
    []
  )

  const push = useCallback(
    <T extends { $jazz: { push: (item: any) => void } }>(
      list: T,
      item: any
    ) => {
      list.$jazz.push(item)
    },
    []
  )

  return useMemo(
    () => ({ create, update, remove, push }),
    [create, update, remove, push]
  )
}

/**
 * Connection status hook
 *
 * @example
 * const { isOnline } = useOnlineStatus()
 */
export function useOnlineStatus() {
  const connected = useSyncConnectionStatus()
  return { isOnline: connected }
}
