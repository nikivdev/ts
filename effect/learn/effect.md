# Effect

Effect is a TypeScript framework for building robust, type-safe applications with managed side effects, structured concurrency, and dependency injection.

## Core Type

```typescript
Effect<A, E, R>
```

- **A** - Success value type
- **E** - Error type (typed errors!)
- **R** - Requirements/dependencies needed

## Creating Effects

```typescript
import { Effect } from "effect"

// Success
Effect.succeed(42)

// Failure
Effect.fail(new Error("oops"))

// From Promise
Effect.tryPromise(() => fetch("/api"))

// Sync with possible error
Effect.try(() => JSON.parse(data))

// Async callback
Effect.async((resume) => {
  setTimeout(() => resume(Effect.succeed("done")), 1000)
})
```

## Composition with Effect.gen

The primary way to compose Effects - uses generators for sequential flow:

```typescript
const program = Effect.gen(function* () {
  const user = yield* fetchUser(id)
  const posts = yield* fetchPosts(user.id)
  yield* Effect.log(`Found ${posts.length} posts`)
  return posts
})
```

`yield*` unwraps the Effect, giving you the success value. Errors propagate automatically.

## Running Effects

```typescript
// Returns Promise
Effect.runPromise(program)

// Sync execution
Effect.runSync(program)

// With full Exit info
Effect.runPromiseExit(program)
```

## Error Handling

### Typed Errors

Errors are part of the type signature - no surprise exceptions:

```typescript
const divide = (a: number, b: number): Effect.Effect<number, "DivByZero"> =>
  b === 0 ? Effect.fail("DivByZero") : Effect.succeed(a / b)
```

### Catching Errors

```typescript
// Catch all errors
program.pipe(Effect.catchAll((error) => Effect.succeed(fallback)))

// Catch specific errors
program.pipe(Effect.catchTag("NotFound", () => Effect.succeed(null)))

// Convert to Either for branching
const result = yield* program.pipe(Effect.either)
if (Either.isRight(result)) {
  // success: result.right
} else {
  // failure: result.left
}
```

### Retries

```typescript
import { Schedule, Duration } from "effect"

program.pipe(
  Effect.retry(
    Schedule.exponential(Duration.millis(100)).pipe(
      Schedule.compose(Schedule.recurs(5))
    )
  )
)
```

## Services & Dependency Injection

### Define a Service

```typescript
import { Context, Effect, Layer } from "effect"

// Service interface
interface Database {
  query: (sql: string) => Effect.Effect<Row[]>
}

// Tag for the service
const Database = Context.GenericTag<Database>("Database")

// Use in effects
const getUsers = Effect.gen(function* () {
  const db = yield* Database
  return yield* db.query("SELECT * FROM users")
})
// Type: Effect<Row[], never, Database>
```

### Create a Layer

Layers are "recipes" for creating services:

```typescript
const DatabaseLive = Layer.succeed(Database, {
  query: (sql) => Effect.tryPromise(() => pool.query(sql))
})

// With resource management
const DatabaseLive = Layer.scoped(
  Database,
  Effect.gen(function* () {
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => createPool()),
      (pool) => Effect.sync(() => pool.close())
    )
    return { query: (sql) => Effect.tryPromise(() => pool.query(sql)) }
  })
)
```

### Provide Dependencies

```typescript
const program = getUsers.pipe(Effect.provide(DatabaseLive))
// Type: Effect<Row[], Error, never> - Database requirement satisfied!
```

### Compose Layers

```typescript
const AppLayer = Layer.mergeAll(DatabaseLive, LoggerLive, ConfigLive)

// Layers can depend on other layers
const ServiceLayer = Layer.provide(DatabaseLive, ConnectionPoolLive)
```

## Resource Management

### Scoped Resources

```typescript
const program = Effect.gen(function* () {
  const file = yield* Effect.acquireRelease(
    Effect.sync(() => openFile(path)),
    (file) => Effect.sync(() => file.close())
  )
  return yield* readContents(file)
}).pipe(Effect.scoped) // Cleanup runs automatically
```

### Finalizers

```typescript
Effect.gen(function* () {
  yield* Effect.addFinalizer(() => Effect.log("Cleaning up"))
  // ... do work
})
```

## Concurrency

### Parallel Execution

```typescript
// Run all in parallel
const results = yield* Effect.all([task1, task2, task3], {
  concurrency: "unbounded"
})

// With concurrency limit
const results = yield* Effect.all(tasks, { concurrency: 4 })

// Race - first to complete wins
const winner = yield* Effect.race(task1, task2)
```

### Fibers

Lightweight virtual threads:

```typescript
const program = Effect.gen(function* () {
  const fiber = yield* Effect.fork(longRunningTask)
  // ... do other work
  const result = yield* Fiber.join(fiber)
})

// Interrupt a fiber
yield* Fiber.interrupt(fiber)
```

## Streams

For processing sequences of values:

```typescript
import { Stream } from "effect"

const stream = Stream.make(1, 2, 3).pipe(
  Stream.map((n) => n * 2),
  Stream.filter((n) => n > 2),
  Stream.mapEffect((n) => saveToDb(n))
)

// Run stream
yield* Stream.runCollect(stream)
yield* Stream.runForEach(stream, (item) => Effect.log(item))
```

## Observability

### Logging

```typescript
yield* Effect.log("Info message")
yield* Effect.logDebug("Debug info")
yield* Effect.logError("Something failed")
yield* Effect.logWarning("Watch out")
```

### Tracing with Spans

```typescript
const fetchUser = Effect.gen(function* () {
  yield* Effect.logInfo("Fetching user")
  const user = yield* queryDb("SELECT * FROM users WHERE id = ?", [id])
  return user
}).pipe(Effect.withSpan("fetch-user"))

// Nested spans create trace trees
const program = Effect.gen(function* () {
  const user = yield* fetchUser.pipe(Effect.withSpan("auth"))
  const data = yield* fetchData.pipe(Effect.withSpan("data"))
}).pipe(Effect.withSpan("request"))
```

## Common Patterns

### Service with Operations

```typescript
interface TaskRunner {
  run: <A, E, R>(
    label: string,
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
}

const TaskRunner = Context.GenericTag<TaskRunner>("TaskRunner")

const TaskRunnerLive = Layer.scoped(
  TaskRunner,
  Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Effect.log("TaskRunner shutting down"))

    return TaskRunner.of({
      run: (label, effect) =>
        Effect.gen(function* () {
          yield* Effect.log(`Starting: ${label}`)
          const result = yield* effect
          yield* Effect.log(`Completed: ${label}`)
          return result
        })
    })
  })
)
```

### Config Management

```typescript
import { Config } from "effect"

const program = Effect.gen(function* () {
  const port = yield* Config.number("PORT")
  const host = yield* Config.string("HOST").pipe(Config.withDefault("localhost"))
  const dbUrl = yield* Config.secret("DATABASE_URL")
})
```

### Request Batching

```typescript
import { Request, RequestResolver, Effect } from "effect"

interface GetUser extends Request.Request<User, Error> {
  readonly _tag: "GetUser"
  readonly id: number
}

const GetUser = Request.tagged<GetUser>("GetUser")

const UserResolver = RequestResolver.makeBatched((requests: GetUser[]) =>
  Effect.tryPromise(() =>
    db.query("SELECT * FROM users WHERE id IN (?)", requests.map(r => r.id))
  )
)

// Requests automatically batch!
const users = yield* Effect.all([
  Effect.request(GetUser({ id: 1 }), UserResolver),
  Effect.request(GetUser({ id: 2 }), UserResolver),
  Effect.request(GetUser({ id: 3 }), UserResolver),
])
```

## Ecosystem Packages

- **@effect/platform** - HTTP, filesystem, cross-runtime APIs
- **@effect/schema** - Data validation and transformation
- **@effect/cli** - Build CLI applications
- **@effect/sql** - Database access (Postgres, MySQL, SQLite, etc.)
- **@effect/rpc** - Type-safe remote procedure calls
- **@effect/cluster** - Distributed computing
- **@effect/opentelemetry** - Tracing integration

## Quick Reference

| Operation | Code |
|-----------|------|
| Create success | `Effect.succeed(value)` |
| Create failure | `Effect.fail(error)` |
| Map value | `effect.pipe(Effect.map(f))` |
| Chain effects | `effect.pipe(Effect.flatMap(f))` |
| Handle error | `effect.pipe(Effect.catchAll(f))` |
| Add timeout | `effect.pipe(Effect.timeout(Duration.seconds(5)))` |
| Retry | `effect.pipe(Effect.retry(schedule))` |
| Run parallel | `Effect.all([...effects], { concurrency: n })` |
| Fork fiber | `Effect.fork(effect)` |
| Add span | `effect.pipe(Effect.withSpan("name"))` |
| Provide layer | `effect.pipe(Effect.provide(layer))` |
| Scope resources | `effect.pipe(Effect.scoped)` |
