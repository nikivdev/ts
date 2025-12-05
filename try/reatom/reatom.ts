import { atom } from "@reatom/core"

export function tryReatom() {
  const counter = atom(0)
  console.log(counter())
}
