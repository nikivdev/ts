import { Duration } from "effect"

export interface JitterConfig {
  readonly type: "full" | "equal" | "decorrelated"
  readonly factor?: number
}

export interface ExponentialBackoff {
  readonly _tag: "Exponential"
  readonly base: Duration.DurationInput
  readonly factor?: number
  readonly max?: Duration.DurationInput
  readonly jitter?: boolean | JitterConfig
}

export interface LinearBackoff {
  readonly _tag: "Linear"
  readonly initial: Duration.DurationInput
  readonly increment: Duration.DurationInput
  readonly max?: Duration.DurationInput
  readonly jitter?: boolean | JitterConfig
}

export interface ConstantBackoff {
  readonly _tag: "Constant"
  readonly duration: Duration.DurationInput
  readonly jitter?: boolean | JitterConfig
}

export type BackoffConfig = ExponentialBackoff | LinearBackoff | ConstantBackoff

export function isBackoffConfig(value: unknown): value is BackoffConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "_tag" in value &&
    typeof (value as Record<string, unknown>)._tag === "string" &&
    ["Exponential", "Linear", "Constant"].includes(
      (value as Record<string, unknown>)._tag as string,
    )
  )
}

export function calculateDelay(
  config: BackoffConfig,
  attempt: number,
  random: () => number = Math.random,
): Duration.Duration {
  const baseDelay = calculateBaseDelay(config, attempt)
  const cappedDelay = applyMax(config, baseDelay)
  return applyJitter(config, cappedDelay, random)
}

function calculateBaseDelay(
  config: BackoffConfig,
  attempt: number,
): Duration.Duration {
  switch (config._tag) {
    case "Exponential": {
      const factor = config.factor ?? 2
      const baseMs = Duration.toMillis(Duration.decode(config.base))
      return Duration.millis(baseMs * Math.pow(factor, attempt))
    }
    case "Linear": {
      const initialMs = Duration.toMillis(Duration.decode(config.initial))
      const incrementMs = Duration.toMillis(Duration.decode(config.increment))
      return Duration.millis(initialMs + attempt * incrementMs)
    }
    case "Constant": {
      return Duration.decode(config.duration)
    }
  }
}

function applyMax(
  config: BackoffConfig,
  delay: Duration.Duration,
): Duration.Duration {
  if ("max" in config && config.max !== undefined) {
    const maxDuration = Duration.decode(config.max)
    return Duration.min(delay, maxDuration)
  }
  return delay
}

function applyJitter(
  config: BackoffConfig,
  delay: Duration.Duration,
  random: () => number,
): Duration.Duration {
  const jitter = config.jitter
  if (!jitter) return delay

  const jitterConfig: JitterConfig =
    typeof jitter === "boolean" ? { type: "full" } : jitter

  const delayMs = Duration.toMillis(delay)

  switch (jitterConfig.type) {
    case "full":
      return Duration.millis(random() * delayMs)
    case "equal":
      return Duration.millis(delayMs / 2 + random() * (delayMs / 2))
    case "decorrelated": {
      const factor = jitterConfig.factor ?? 3
      return Duration.millis(random() * delayMs * factor)
    }
  }
}

export const Backoff = {
  exponential: (
    config: Omit<ExponentialBackoff, "_tag">,
  ): ExponentialBackoff => ({
    _tag: "Exponential",
    ...config,
  }),

  linear: (config: Omit<LinearBackoff, "_tag">): LinearBackoff => ({
    _tag: "Linear",
    ...config,
  }),

  constant: (
    duration: Duration.DurationInput,
    jitter?: boolean | JitterConfig,
  ): ConstantBackoff => ({
    _tag: "Constant",
    duration,
    jitter,
  }),

  presets: {
    standard: (): ExponentialBackoff => ({
      _tag: "Exponential",
      base: "1 second",
      factor: 2,
      max: "30 seconds",
      jitter: true,
    }),

    aggressive: (): ExponentialBackoff => ({
      _tag: "Exponential",
      base: "100 millis",
      factor: 2,
      max: "5 seconds",
      jitter: true,
    }),

    patient: (): ExponentialBackoff => ({
      _tag: "Exponential",
      base: "5 seconds",
      factor: 2,
      max: "2 minutes",
      jitter: true,
    }),

    simple: (): ConstantBackoff => ({
      _tag: "Constant",
      duration: "1 second",
      jitter: true,
    }),
  },
} as const
