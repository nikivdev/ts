import { Console, Effect } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { R2, R2Live, type R2Config } from "./index.js"

// Get config from environment
const getConfig = Effect.gen(function* () {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    yield* Console.log("Missing R2 configuration. Set these environment variables:")
    yield* Console.log("  R2_ACCOUNT_ID")
    yield* Console.log("  R2_ACCESS_KEY_ID")
    yield* Console.log("  R2_SECRET_ACCESS_KEY")
    yield* Console.log("  R2_BUCKET")
    return yield* Effect.fail(new Error("Missing R2 configuration"))
  }

  return { accountId, accessKeyId, secretAccessKey, bucket } satisfies R2Config
})

const program = Effect.gen(function* () {
  yield* Console.log("=== Testing R2 Abstraction ===\n")

  const config = yield* getConfig
  yield* Console.log(`Bucket: ${config.bucket}\n`)

  const r2 = yield* R2

  // Test: Put text
  yield* Console.log("1. Putting text object...")
  const textObj = yield* r2.put("test/hello.txt", "Hello, R2!", {
    contentType: "text/plain",
    customMetadata: { author: "effect-test" },
  })
  yield* Console.log(`   Created: ${textObj.key} (${textObj.size} bytes)`)

  // Test: Put JSON
  yield* Console.log("\n2. Putting JSON object...")
  const jsonObj = yield* r2.putJson("test/data.json", {
    name: "Effect R2 Test",
    timestamp: new Date().toISOString(),
    items: [1, 2, 3],
  })
  yield* Console.log(`   Created: ${jsonObj.key} (${jsonObj.size} bytes)`)

  // Test: Get text
  yield* Console.log("\n3. Getting text object...")
  const text = yield* r2.getText("test/hello.txt")
  yield* Console.log(`   Content: "${text}"`)

  // Test: Get JSON
  yield* Console.log("\n4. Getting JSON object...")
  const json = yield* r2.getJson<{ name: string; timestamp: string }>("test/data.json")
  yield* Console.log(`   Name: ${json.name}`)
  yield* Console.log(`   Timestamp: ${json.timestamp}`)

  // Test: Head
  yield* Console.log("\n5. Getting object metadata...")
  const meta = yield* r2.head("test/hello.txt")
  yield* Console.log(`   Size: ${meta.size}`)
  yield* Console.log(`   ETag: ${meta.etag}`)
  yield* Console.log(`   Content-Type: ${meta.httpMetadata?.contentType}`)

  // Test: Exists
  yield* Console.log("\n6. Checking existence...")
  const exists = yield* r2.exists("test/hello.txt")
  const notExists = yield* r2.exists("test/nonexistent.txt")
  yield* Console.log(`   test/hello.txt exists: ${exists}`)
  yield* Console.log(`   test/nonexistent.txt exists: ${notExists}`)

  // Test: List
  yield* Console.log("\n7. Listing objects with prefix 'test/'...")
  const list = yield* r2.list({ prefix: "test/" })
  yield* Console.log(`   Found ${list.objects.length} object(s):`)
  for (const obj of list.objects) {
    yield* Console.log(`     - ${obj.key} (${obj.size} bytes)`)
  }

  // Test: Copy
  yield* Console.log("\n8. Copying object...")
  const copied = yield* r2.copy("test/hello.txt", "test/hello-copy.txt")
  yield* Console.log(`   Copied to: ${copied.key}`)

  // Test: Delete
  yield* Console.log("\n9. Cleaning up...")
  yield* r2.deleteMany(["test/hello.txt", "test/hello-copy.txt", "test/data.json"])
  yield* Console.log("   Deleted test objects")

  // Verify deletion
  const afterDelete = yield* r2.list({ prefix: "test/" })
  yield* Console.log(`   Objects remaining in test/: ${afterDelete.objects.length}`)

  yield* Console.log("\n=== R2 Test Complete ===")
}).pipe(
  Effect.provide(R2Live({
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucket: process.env.R2_BUCKET!,
  })),
  Effect.catchAll((error) =>
    Console.log(`Error: ${error._tag ?? "Unknown"} - ${error.message ?? error}`),
  ),
)

program.pipe(NodeRuntime.runMain)
