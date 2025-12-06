import { Console, Config, Effect, Redacted, Schema } from "effect"
import { TaggedError } from "effect/Data"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { FetchHttpClient, HttpClient } from "@effect/platform"
import { Prompt } from "@effect/cli"
import { CommitSearchResult } from "./schema.js"

class ApiFetchError extends TaggedError("ApiFetchError")<{
  message: string
  status: number
}> {}

const getCommits = (username: string, date: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const token = yield* Config.redacted("GITHUB_TOKEN").pipe(
      Effect.orElseSucceed(() => Redacted.make(""))
    )

    const query = `author:${username} committer-date:${date}`
    const url = `https://api.github.com/search/commits?q=${encodeURIComponent(query)}&sort=committer-date&order=desc&per_page=100`

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "effect-github-commits",
    }

    const tokenValue = Redacted.value(token)
    if (tokenValue) {
      headers["Authorization"] = `Bearer ${tokenValue}`
    }

    const response = yield* client.get(url, { headers })

    if (response.status < 200 || response.status >= 300) {
      const body = yield* response.text.pipe(
        Effect.orElseSucceed(() => "Unknown error")
      )
      return yield* new ApiFetchError({ message: body, status: response.status })
    }

    const json = yield* response.json
    return yield* Schema.decodeUnknown(CommitSearchResult)(json)
  })

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`

const displayCommits = (username: string, date: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching commits for ${bold(username)} on ${bold(date)}...\n`)

    const result = yield* getCommits(username, date)

    if (result.items.length === 0) {
      yield* Console.log("No commits found for the specified date.")
      return
    }

    yield* Console.log(`Found ${bold(String(result.total_count))} commit(s):\n`)

    for (const item of result.items) {
      const messageLines = item.commit.message.split("\n")
      const firstLine = messageLines[0] ?? ""
      const shortSha = item.sha.slice(0, 7)

      yield* Console.log(`${bold(item.repository.full_name)}`)
      yield* Console.log(`  ${dim(shortSha)} ${firstLine}`)
      yield* Console.log(`  ${dim(item.html_url)}\n`)
    }
  })

const getTodayDate = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const program = Effect.gen(function* () {
  const args = process.argv.slice(2)

  // Usage: bun start <username> <date|today>
  // Or interactive mode if no args
  if (args.length >= 2) {
    const username = args[0]!
    const dateArg = args[1]!
    const date = dateArg === "today" ? getTodayDate() : dateArg
    yield* displayCommits(username, date)
  } else if (args.length === 1 && args[0] === "today") {
    // Just "today" - prompt for username
    const username = yield* Prompt.text({ message: "GitHub username:" })
    yield* displayCommits(username, getTodayDate())
  } else {
    // Interactive mode
    const username = yield* Prompt.text({ message: "GitHub username:" })
    const date = yield* Prompt.text({
      message: "Date (YYYY-MM-DD, range like 2024-01-01..2024-01-31, or 'today'):",
    })
    const resolvedDate = date === "today" ? getTodayDate() : date
    yield* displayCommits(username, resolvedDate)
  }
})

program.pipe(
  Effect.catchAll((error) => Console.log(`Error: ${error}`)),
  Effect.provide(NodeContext.layer),
  Effect.provide(FetchHttpClient.layer),
  NodeRuntime.runMain
)
