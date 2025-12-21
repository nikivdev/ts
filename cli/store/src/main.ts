import { object } from "@optique/core/constructs"
import { message } from "@optique/core/message"
import type { InferValue } from "@optique/core/parser"
import { argument, command, constant, option } from "@optique/core/primitives"
import { optional } from "@optique/core/modifiers"
import { string } from "@optique/core/valueparser"
import { run } from "@optique/run"
import { Effect } from "effect"
import { promises as fs } from "node:fs"
import path from "node:path"
import process from "node:process"
import { R2, R2Live, type R2Config } from "../../effect/lib/cloudflare/index.js"

const VERSION = "0.1"
const PROGRAM_NAME = "store"
const TAGLINE = "Store content in Cloudflare R2"

const putCommand = command(
  "put",
  object({
    action: constant("put"),
    key: argument(string(), {
      description: message`R2 object key (for example, docs/readme.md)`,
    }),
    file: optional(
      option("--file", string(), {
        description: message`Read content from a file path`,
      }),
    ),
    text: optional(
      option("--text", string(), {
        description: message`Inline text content to store`,
      }),
    ),
    stdin: option("--stdin", {
      description: message`Read content from stdin (or pipe data into the command)`,
    }),
    contentType: optional(
      option("--content-type", string(), {
        description: message`Override content type (e.g. text/plain; charset=utf-8)`,
      }),
    ),
    cacheControl: optional(
      option("--cache-control", string(), {
        description: message`Cache-Control header value`,
      }),
    ),
    contentDisposition: optional(
      option("--content-disposition", string(), {
        description: message`Content-Disposition header value`,
      }),
    ),
    metadata: optional(
      option("--metadata", string(), {
        description: message`Comma-separated metadata pairs (k=v,k2=v2)`,
      }),
    ),
  }),
)

const cli = putCommand

type StoreCommand = InferValue<typeof cli>

type PutCommand = Extract<StoreCommand, { action: "put" }>

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
}

async function execute(command: StoreCommand) {
  switch (command.action) {
    case "put":
      await putObject(command)
      break
  }
}

async function putObject(command: PutCommand) {
  const config = loadR2Config()

  const input = await resolveInput(command)
  const metadata = parseMetadata(command.metadata)

  const program = Effect.gen(function* () {
    const r2 = yield* R2
    return yield* r2.put(command.key, input.body, {
      contentType: command.contentType ?? input.inferredContentType,
      cacheControl: command.cacheControl,
      contentDisposition: command.contentDisposition,
      customMetadata: metadata,
    })
  })

  const result = await Effect.runPromise(program.pipe(Effect.provide(R2Live(config))))

  console.log("Stored object")
  console.log(`- bucket: ${config.bucket}`)
  console.log(`- key: ${result.key}`)
  console.log(`- size: ${result.size} bytes`)
  if (result.etag) {
    console.log(`- etag: ${result.etag}`)
  }
}

function loadR2Config(): R2Config {
  return {
    accountId: requireEnv("R2_ACCOUNT_ID"),
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucket: requireEnv("R2_BUCKET"),
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Environment variable ${name} is required.`)
  }
  return value
}

async function resolveInput(command: PutCommand): Promise<{
  body: string | Uint8Array
  inferredContentType?: string
}> {
  const sources = [
    command.file != null ? "file" : undefined,
    command.text != null ? "text" : undefined,
    command.stdin ? "stdin" : undefined,
  ].filter((value): value is string => Boolean(value))

  const shouldReadFromPipe = !process.stdin.isTTY && sources.length === 0

  if (sources.length > 1) {
    throw new Error("Choose only one of --file, --text, or --stdin.")
  }

  if (sources.length === 0 && !shouldReadFromPipe) {
    throw new Error("Provide --file, --text, or --stdin (or pipe data via stdin).")
  }

  if (command.file != null) {
    const filePath = expandHome(command.file)
    const content = await fs.readFile(filePath)
    return {
      body: content,
      inferredContentType: inferContentType(filePath),
    }
  }

  if (command.text != null) {
    return {
      body: command.text,
      inferredContentType: "text/plain; charset=utf-8",
    }
  }

  const stdin = await readStdin()
  return {
    body: stdin,
    inferredContentType: "application/octet-stream",
  }
}

function inferContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  return CONTENT_TYPE_BY_EXT[ext]
}

function parseMetadata(input: string | undefined) {
  if (!input) {
    return undefined
  }

  const metadata: Record<string, string> = {}
  const pairs = input
    .split(",")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)

  for (const pair of pairs) {
    const [rawKey, ...valueParts] = pair.split("=")
    const key = rawKey?.trim()
    const value = valueParts.join("=").trim()

    if (!key || !value) {
      throw new Error(`Invalid metadata entry: ${pair}. Use k=v format.`)
    }

    metadata[key] = value
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function expandHome(candidatePath: string) {
  if (candidatePath.startsWith("~")) {
    const home = process.env.HOME
    if (home) {
      return path.join(home, candidatePath.slice(1))
    }
  }
  return candidatePath
}

async function readStdin() {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    console.log(VERSION)
    return
  }

  if (args.length === 0) {
    printTopLevelHelp()
    return
  }

  const parsed = run(cli, {
    programName: PROGRAM_NAME,
    help: "both",
    brief: message`${TAGLINE}`,
  })

  await execute(parsed)
}

function printTopLevelHelp() {
  console.log(`${PROGRAM_NAME} ${VERSION}`)
  console.log(`${TAGLINE}\n`)
  console.log("Commands:")
  console.log("  put   Store content in Cloudflare R2")
  console.log("\nEnvironment:")
  console.log("  R2_ACCOUNT_ID")
  console.log("  R2_ACCESS_KEY_ID")
  console.log("  R2_SECRET_ACCESS_KEY")
  console.log("  R2_BUCKET")
  console.log("\nExamples:")
  console.log(`  ${PROGRAM_NAME} put notes/hello.txt --text "hello"`)
  console.log(`  ${PROGRAM_NAME} put assets/logo.png --file ./logo.png`)
  console.log(`  echo "hi" | ${PROGRAM_NAME} put logs/hello.txt`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
