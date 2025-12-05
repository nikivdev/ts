import { co, z } from "jazz-tools"

export const Log = co.map({
  content: z.string(),
  owner: z.string(),
})

export const receiveLog = (log: unknown) => {}

export function tryJazz() {}
