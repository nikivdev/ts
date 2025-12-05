import { Args, Command, Options } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect } from "effect"

// Simple CLI example to iterate on
// Usage: bun cli/main.ts greet --name "World" --loud

// Options
const name = Options.text("name").pipe(
  Options.withDescription("Name to greet"),
  Options.withDefault("World")
)
const loud = Options.boolean("loud").pipe(
  Options.withDescription("Shout the greeting"),
  Options.withDefault(false)
)

// Args
const times = Args.integer({ name: "times" }).pipe(
  Args.withDescription("Number of times to greet"),
  Args.withDefault(1)
)

// Commands
const greet = Command.make(
  "greet",
  { name, loud, times },
  ({ name, loud, times }) =>
    Effect.gen(function* () {
      const message = `Hello, ${name}!`
      const output = loud ? message.toUpperCase() : message

      for (let i = 0; i < times; i++) {
        yield* Console.log(output)
      }
    })
)

const root = Command.make("mycli").pipe(
  Command.withSubcommands([greet])
)

// Run
const cli = Command.run(root, {
  name: "My CLI",
  version: "0.0.1"
})

Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain
)
