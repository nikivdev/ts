import { Console, Config, Effect, Redacted, Schema } from "effect"
import { TaggedError } from "effect/Data"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { FetchHttpClient, HttpClient } from "@effect/platform"
import { Prompt } from "@effect/cli"
import { CommitSearchResult, GitHubEvent, PushEventPayload } from "./schema.js"

class ApiFetchError extends TaggedError("ApiFetchError")<{
  message: string
  status: number
}> {}

class MissingTokenError extends TaggedError("MissingTokenError")<{
  message: string
}> {}

const getToken = Effect.gen(function* () {
  const token = yield* Config.redacted("GITHUB_TOKEN").pipe(
    Effect.orElseSucceed(() => Redacted.make("")),
  )
  return token
})

const requireToken = Effect.gen(function* () {
  const token = yield* getToken
  const tokenValue = Redacted.value(token)
  if (!tokenValue) {
    return yield* new MissingTokenError({
      message:
        "GITHUB_TOKEN is required for private commits. Set it via: export GITHUB_TOKEN=your_token",
    })
  }
  return token
})

const getPublicCommits = (username: string, date: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const token = yield* getToken

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
        Effect.orElseSucceed(() => "Unknown error"),
      )
      return yield* new ApiFetchError({
        message: body,
        status: response.status,
      })
    }

    const json = yield* response.json
    return yield* Schema.decodeUnknown(CommitSearchResult)(json)
  })

interface CommitInfo {
  repo: string
  sha: string
  message: string
  url: string
  date: string
}

const getPrivateCommits = (username: string, date: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const token = yield* requireToken

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "effect-github-commits",
      Authorization: `Bearer ${Redacted.value(token)}`,
    }

    // Parse date range
    const [startDate, endDate] = date.includes("..")
      ? date.split("..")
      : [date, date]

    const start = new Date(startDate + "T00:00:00Z")
    const end = new Date(endDate + "T23:59:59Z")

    // Fetch user events (includes private repos if token has access)
    const commits: CommitInfo[] = []
    let page = 1
    const maxPages = 10 // Events API only keeps ~90 days, 30 events per page

    while (page <= maxPages) {
      const url = `https://api.github.com/users/${username}/events?per_page=100&page=${page}`
      const response = yield* client.get(url, { headers })

      if (response.status < 200 || response.status >= 300) {
        const body = yield* response.text.pipe(
          Effect.orElseSucceed(() => "Unknown error"),
        )
        return yield* new ApiFetchError({
          message: body,
          status: response.status,
        })
      }

      const json = yield* response.json
      const events = yield* Schema.decodeUnknown(Schema.Array(GitHubEvent))(
        json,
      )

      if (events.length === 0) break

      for (const event of events) {
        if (event.type !== "PushEvent") continue

        const eventDate = new Date(event.created_at)
        if (eventDate < start) {
          // Events are sorted by date desc, so we can stop early
          page = maxPages + 1
          break
        }
        if (eventDate > end) continue

        const payloadResult = Schema.decodeUnknownOption(PushEventPayload)(
          event.payload,
        )
        if (payloadResult._tag === "None") continue

        const payload = payloadResult.value
        for (const commit of payload.commits) {
          commits.push({
            repo: event.repo.name,
            sha: commit.sha,
            message: commit.message,
            url: `https://github.com/${event.repo.name}/commit/${commit.sha}`,
            date: event.created_at,
          })
        }
      }

      page++
    }

    return commits
  })

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`

const displayPublicCommits = (username: string, date: string) =>
  Effect.gen(function* () {
    yield* Console.log(
      `Fetching public commits for ${bold(username)} on ${bold(date)}...\n`,
    )

    const result = yield* getPublicCommits(username, date)

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

const displayPrivateCommits = (username: string, date: string) =>
  Effect.gen(function* () {
    yield* Console.log(
      `Fetching commits (incl. private) for ${bold(username)} on ${bold(date)}...\n`,
    )

    const commits = yield* getPrivateCommits(username, date)

    if (commits.length === 0) {
      yield* Console.log("No commits found for the specified date.")
      return
    }

    yield* Console.log(`Found ${bold(String(commits.length))} commit(s):\n`)

    for (const commit of commits) {
      const messageLines = commit.message.split("\n")
      const firstLine = messageLines[0] ?? ""
      const shortSha = commit.sha.slice(0, 7)

      yield* Console.log(`${bold(commit.repo)}`)
      yield* Console.log(`  ${dim(shortSha)} ${firstLine}`)
      yield* Console.log(`  ${dim(commit.url)}\n`)
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

  // Check for --private or -p flag
  const isPrivate = args.includes("--private") || args.includes("-p")
  const filteredArgs = args.filter((a) => a !== "--private" && a !== "-p")

  const display = isPrivate ? displayPrivateCommits : displayPublicCommits

  // Usage: bun start [--private] <username> <date|today>
  // Or interactive mode if no args
  if (filteredArgs.length >= 2) {
    const username = filteredArgs[0]!
    const dateArg = filteredArgs[1]!
    const date = dateArg === "today" ? getTodayDate() : dateArg
    yield* display(username, date)
  } else if (filteredArgs.length === 1 && filteredArgs[0] === "today") {
    const username = yield* Prompt.text({ message: "GitHub username:" })
    yield* display(username, getTodayDate())
  } else if (filteredArgs.length === 1) {
    // Single arg that's not "today" - treat as username, prompt for date
    const username = filteredArgs[0]!
    const date = yield* Prompt.text({
      message:
        "Date (YYYY-MM-DD, range like 2024-01-01..2024-01-31, or 'today'):",
    })
    const resolvedDate = date === "today" ? getTodayDate() : date
    yield* display(username, resolvedDate)
  } else {
    // Interactive mode
    const username = yield* Prompt.text({ message: "GitHub username:" })
    const date = yield* Prompt.text({
      message:
        "Date (YYYY-MM-DD, range like 2024-01-01..2024-01-31, or 'today'):",
    })
    const resolvedDate = date === "today" ? getTodayDate() : date
    yield* display(username, resolvedDate)
  }
})

program.pipe(
  Effect.catchAll((error) => Console.log(`Error: ${error}`)),
  Effect.provide(NodeContext.layer),
  Effect.provide(FetchHttpClient.layer),
  NodeRuntime.runMain,
)
