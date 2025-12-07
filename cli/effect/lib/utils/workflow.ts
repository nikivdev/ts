import { Console, Context, Duration, Effect, Layer, Ref } from "effect"
import { TaggedError } from "effect/Data"
import {
  Backoff,
  calculateDelay,
  isBackoffConfig,
  type BackoffConfig,
} from "./backoff.js"

// Re-export Backoff for convenience
export { Backoff, calculateDelay, isBackoffConfig, type BackoffConfig }
export type { ExponentialBackoff, LinearBackoff, ConstantBackoff } from "./backoff.js"

export class StepError extends TaggedError("StepError")<{
  stepName: string
  cause: unknown
  attempt: number
}> {}

export class StepTimeoutError extends TaggedError("StepTimeoutError")<{
  stepName: string
  timeoutMs: number
}> {}

export class RetryExhaustedError extends TaggedError("RetryExhaustedError")<{
  stepName: string
  attempts: number
  lastError: unknown
}> {}

export interface RetryOptions {
  maxAttempts: number
  delay?: Duration.DurationInput | ((attempt: number) => Duration.DurationInput) | BackoffConfig
  maxDuration?: Duration.DurationInput
}

export interface WorkflowContextService {
  readonly workflowId: string
  readonly workflowName: string
  readonly completedSteps: Effect.Effect<readonly string[]>
  hasCompleted: (stepName: string) => Effect.Effect<boolean>
  markCompleted: (stepName: string) => Effect.Effect<void>
  getStepResult: <T>(stepName: string) => Effect.Effect<T | undefined>
  setStepResult: <T>(stepName: string, result: T) => Effect.Effect<void>
}

export class WorkflowContext extends Context.Tag("WorkflowContext")<
  WorkflowContext,
  WorkflowContextService
>() {}

export interface StepContextService {
  readonly stepName: string
  readonly attempt: number
  incrementAttempt: Effect.Effect<void>
}

export class StepContext extends Context.Tag("StepContext")<
  StepContext,
  StepContextService
>() {}

interface WorkflowState {
  completedSteps: string[]
  stepResults: Map<string, unknown>
  stepAttempts: Map<string, number>
}

export const createWorkflowContext = (
  workflowId: string,
  workflowName: string,
) =>
  Effect.gen(function* () {
    const stateRef = yield* Ref.make<WorkflowState>({
      completedSteps: [],
      stepResults: new Map(),
      stepAttempts: new Map(),
    })

    const service: WorkflowContextService = {
      workflowId,
      workflowName,
      completedSteps: Ref.get(stateRef).pipe(
        Effect.map((s) => s.completedSteps),
      ),
      hasCompleted: (stepName) =>
        Ref.get(stateRef).pipe(
          Effect.map((s) => s.completedSteps.includes(stepName)),
        ),
      markCompleted: (stepName) =>
        Ref.update(stateRef, (s) => ({
          ...s,
          completedSteps: [...s.completedSteps, stepName],
        })),
      getStepResult: <T>(stepName: string) =>
        Ref.get(stateRef).pipe(
          Effect.map((s) => s.stepResults.get(stepName) as T | undefined),
        ),
      setStepResult: <T>(stepName: string, result: T) =>
        Ref.update(stateRef, (s) => {
          s.stepResults.set(stepName, result)
          return s
        }),
    }

    return Layer.succeed(WorkflowContext, service)
  })

export namespace Workflow {
  export function make<Input, A, E, R>(
    name: string,
    definition: (input: Input) => Effect.Effect<A, E, R>,
  ) {
    return {
      name,
      run: (input: Input) =>
        Effect.gen(function* () {
          const layer = yield* createWorkflowContext(
            `${name}-${Date.now()}`,
            name,
          )
          return yield* definition(input).pipe(Effect.provide(layer))
        }),
    }
  }

  export function step<T, E, R>(
    name: string,
    effect: Effect.Effect<T, E, R>,
  ): Effect.Effect<T, E | StepError, R | WorkflowContext> {
    return Effect.gen(function* () {
      const ctx = yield* WorkflowContext

      const isCompleted = yield* ctx.hasCompleted(name)
      if (isCompleted) {
        const cached = yield* ctx.getStepResult<T>(name)
        if (cached !== undefined) {
          yield* Console.log(`  [${name}] cached`)
          return cached
        }
      }

      yield* Console.log(`  [${name}] executing...`)

      const result = yield* effect.pipe(
        Effect.mapError(
          (e) =>
            new StepError({
              stepName: name,
              cause: e,
              attempt: 0,
            }),
        ),
      )

      yield* ctx.setStepResult(name, result)
      yield* ctx.markCompleted(name)

      yield* Console.log(`  [${name}] completed`)

      return result as T
    })
  }

  export function retry<T, E, R>(
    options: RetryOptions,
  ): (
    effect: Effect.Effect<T, E, R>,
  ) => Effect.Effect<T, E | RetryExhaustedError, R> {
    const { maxAttempts, delay, maxDuration } = options

    return (effect) =>
      Effect.gen(function* () {
        let attempt = 0
        let lastError: unknown = null
        const startTime = Date.now()
        const maxDurationMs = maxDuration
          ? Duration.toMillis(Duration.decode(maxDuration))
          : undefined

        while (attempt < maxAttempts) {
          const result = yield* Effect.either(effect)

          if (result._tag === "Right") {
            return result.right
          }

          lastError = result.left
          attempt++

          if (attempt >= maxAttempts) break

          // Check max duration
          if (maxDurationMs !== undefined) {
            const elapsed = Date.now() - startTime
            if (elapsed >= maxDurationMs) break
          }

          // Calculate delay
          let delayDuration: Duration.Duration
          if (delay === undefined) {
            delayDuration = Duration.seconds(1)
          } else if (typeof delay === "function") {
            delayDuration = Duration.decode(delay(attempt - 1))
          } else if (isBackoffConfig(delay)) {
            delayDuration = calculateDelay(delay, attempt - 1)
          } else {
            delayDuration = Duration.decode(delay)
          }

          const delayMs = Duration.toMillis(delayDuration)
          yield* Console.log(`    retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})`)
          yield* Effect.sleep(delayDuration)
        }

        return yield* Effect.fail(
          new RetryExhaustedError({
            stepName: "unknown",
            attempts: attempt,
            lastError,
          }),
        )
      })
  }

  export function timeout<T, E, R>(
    duration: Duration.DurationInput,
  ): (
    effect: Effect.Effect<T, E, R>,
  ) => Effect.Effect<T, E | StepTimeoutError, R> {
    return (effect) =>
      Effect.gen(function* () {
        const timeoutMs = Duration.toMillis(Duration.decode(duration))

        const result = yield* Effect.timeoutFail(effect, {
          duration: Duration.decode(duration),
          onTimeout: () =>
            new StepTimeoutError({
              stepName: "unknown",
              timeoutMs,
            }),
        })

        return result
      })
  }

  export function sleep(
    duration: Duration.DurationInput,
  ): Effect.Effect<void> {
    return Effect.gen(function* () {
      const ms = Duration.toMillis(Duration.decode(duration))
      yield* Console.log(`  sleeping for ${ms}ms...`)
      yield* Effect.sleep(Duration.decode(duration))
    })
  }

  export const Context = WorkflowContext
  export const Step = StepContext
}
