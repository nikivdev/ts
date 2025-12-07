import { Console, Duration, Effect } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { Workflow, Backoff, calculateDelay } from "./utils/index.js"

// Simulated API call that fails sometimes
const unreliableApiCall = (id: string) =>
  Effect.gen(function* () {
    const shouldFail = Math.random() < 0.5
    if (shouldFail) {
      yield* Console.log(`    API call for ${id} failed!`)
      return yield* Effect.fail(new Error(`API error for ${id}`))
    }
    yield* Console.log(`    API call for ${id} succeeded`)
    return { id, data: `result-${id}` }
  })

// Define a workflow
const processOrderWorkflow = Workflow.make(
  "processOrder",
  (orderId: string) =>
    Effect.gen(function* () {
      yield* Console.log(`\nStarting workflow for order: ${orderId}`)

      // Step 1: Fetch order
      const order = yield* Workflow.step(
        "Fetch order",
        Effect.succeed({ id: orderId, amount: 100 }),
      )

      // Step 2: Validate (with retry)
      yield* Workflow.step(
        "Validate order",
        unreliableApiCall(orderId).pipe(
          Workflow.retry({
            maxAttempts: 3,
            delay: Backoff.exponential({
              base: "500 millis",
              factor: 2,
              max: "5 seconds",
            }),
          }),
        ),
      )

      // Step 3: Short delay
      yield* Workflow.sleep("1 second")

      // Step 4: Process payment (with timeout and retry)
      yield* Workflow.step(
        "Process payment",
        unreliableApiCall(`payment-${orderId}`).pipe(
          Workflow.timeout("10 seconds"),
          Workflow.retry({
            maxAttempts: 3,
            delay: Backoff.presets.standard(),
          }),
        ),
      )

      // Step 5: Send confirmation
      yield* Workflow.step(
        "Send confirmation",
        Effect.succeed({ sent: true, email: "user@example.com" }),
      )

      yield* Console.log(`\nWorkflow completed for order: ${orderId}`)
      return { success: true, order }
    }),
)

// Run the workflow
const program = Effect.gen(function* () {
  yield* Console.log("=== Testing Durable-Effect Workflow Patterns ===\n")

  // Test backoff calculations
  yield* Console.log("Backoff delay examples (exponential 1s base, factor 2, max 10s):")
  const expBackoff = Backoff.exponential({ base: "1 second", factor: 2, max: "10 seconds" })
  for (let i = 0; i < 5; i++) {
    const delay = calculateDelay(expBackoff, i, () => 1) // no jitter for demo
    const ms = Duration.toMillis(delay)
    yield* Console.log(`  Attempt ${i}: ${ms}ms`)
  }

  yield* Console.log("\n--- Running Workflow ---")

  const result = yield* processOrderWorkflow.run("order-123").pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Console.log(`\nWorkflow failed: ${error}`)
        return { success: false, error }
      }),
    ),
  )

  yield* Console.log(`\nFinal result: ${JSON.stringify(result, null, 2)}`)
})

program.pipe(NodeRuntime.runMain)
