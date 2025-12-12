/**
 * Simplified Jazz wrapper for React CRUD applications
 *
 * @example
 * ```tsx
 * // 1. Define your schema
 * import { co, z, defineAccount, defineItem, defineList } from "@/lib/jazz"
 *
 * const Todo = defineItem({
 *   title: z.string(),
 *   done: z.boolean(),
 *   createdAt: z.date(),
 * })
 *
 * const TodoList = defineList(Todo)
 *
 * const MyAccount = defineAccount({
 *   root: {
 *     todos: TodoList,
 *   },
 * })
 *
 * // 2. Wrap your app
 * import { JazzProvider } from "@/lib/jazz"
 *
 * function App() {
 *   return (
 *     <JazzProvider accountSchema={MyAccount}>
 *       <TodoApp />
 *     </JazzProvider>
 *   )
 * }
 *
 * // 3. Use CRUD hooks
 * import { useMe, useCrud, useItem } from "@/lib/jazz"
 *
 * function TodoApp() {
 *   const { me, isLoaded } = useMe(MyAccount, {
 *     resolve: { root: { todos: { $each: true } } }
 *   })
 *   const { create, update, remove, push } = useCrud(Todo)
 *
 *   if (!isLoaded) return <div>Loading...</div>
 *
 *   const addTodo = () => {
 *     const todo = create(
 *       { title: "New todo", done: false, createdAt: new Date() },
 *       me.root.todos
 *     )
 *     push(me.root.todos, todo)
 *   }
 *
 *   const toggleTodo = (todo: typeof Todo) => {
 *     update(todo, { done: !todo.done })
 *   }
 *
 *   const deleteTodo = (index: number) => {
 *     remove(me.root.todos, index)
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={addTodo}>Add Todo</button>
 *       {me.root.todos.map((todo, i) => (
 *         <div key={todo.$jazz.id}>
 *           <input
 *             type="checkbox"
 *             checked={todo.done}
 *             onChange={() => toggleTodo(todo)}
 *           />
 *           {todo.title}
 *           <button onClick={() => deleteTodo(i)}>Delete</button>
 *         </div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */

// Schema builders
export {
  co,
  z,
  defineItem,
  defineList,
  defineAccount,
  createGroup,
  type Loaded,
  type ID,
} from "./schema"

// React hooks
export {
  useItem,
  useList,
  useMe,
  useCrud,
  useOnlineStatus,
  useAccount,
  useLogOut,
} from "./hooks"

// Provider
export { JazzProvider, type JazzConfig } from "./provider"

// Types
export type { ItemId, Role, StoreConfig, LoadState, CrudResult } from "./types"

// Re-export commonly used jazz-tools types
export { Group, Account, CoMap, CoList } from "jazz-tools"
export { createInviteLink, parseInviteLink } from "jazz-tools/react"
