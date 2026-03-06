import { Args, Command, Options } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Layer, Option } from "effect"
import {
  Spotify,
  makeSpotify,
  createSpotifyApi,
  SpotifyError,
  AuthenticationError,
} from "./spotify.js"

const VERSION = "0.1.0"

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`

const formatDuration = (ms: number) => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

const parseSpotifyUri = (input: string): string => {
  if (input.startsWith("spotify:")) {
    return input
  }
  const match = input.match(/open\.spotify\.com\/(track|album|artist|playlist)\/([a-zA-Z0-9]+)/)
  if (match) {
    return `spotify:${match[1]}:${match[2]}`
  }
  return input
}

const extractId = (uriOrUrl: string): string => {
  const uri = parseSpotifyUri(uriOrUrl)
  const parts = uri.split(":")
  return parts[parts.length - 1] ?? uriOrUrl
}

// Shared options
const deviceOption = Options.text("device").pipe(
  Options.withAlias("d"),
  Options.withDescription("Target device ID"),
  Options.optional
)

// Commands

const playCommand = Command.make(
  "play",
  {
    uri: Args.text({ name: "uri" }).pipe(
      Args.withDescription("Track, album, artist, or playlist URI/URL"),
      Args.optional
    ),
    device: deviceOption,
  },
  ({ uri, device }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      const uriValue = Option.getOrUndefined(uri)
      const deviceValue = Option.getOrUndefined(device)

      if (uriValue) {
        const parsedUri = parseSpotifyUri(uriValue)
        yield* spotify.play({ uri: parsedUri, deviceId: deviceValue })
        yield* Console.log(green("▶") + ` Playing ${dim(parsedUri)}`)
      } else {
        yield* spotify.play({ deviceId: deviceValue })
        yield* Console.log(green("▶") + " Resumed playback")
      }
    })
).pipe(Command.withDescription("Play a track, album, artist, or playlist (or resume)"))

const pauseCommand = Command.make(
  "pause",
  { device: deviceOption },
  ({ device }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      yield* spotify.pause(Option.getOrUndefined(device))
      yield* Console.log(yellow("⏸") + " Paused")
    })
).pipe(Command.withDescription("Pause playback"))

const nextCommand = Command.make(
  "next",
  { device: deviceOption },
  ({ device }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      yield* spotify.next(Option.getOrUndefined(device))
      yield* Console.log("⏭ Skipped to next track")
    })
).pipe(Command.withDescription("Skip to next track"))

const prevCommand = Command.make(
  "prev",
  { device: deviceOption },
  ({ device }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      yield* spotify.previous(Option.getOrUndefined(device))
      yield* Console.log("⏮ Skipped to previous track")
    })
).pipe(Command.withDescription("Skip to previous track"))

const volumeCommand = Command.make(
  "volume",
  {
    level: Args.integer({ name: "level" }).pipe(
      Args.withDescription("Volume level (0-100)")
    ),
    device: deviceOption,
  },
  ({ level, device }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      const clamped = Math.max(0, Math.min(100, level))
      yield* spotify.setVolume(clamped, Option.getOrUndefined(device))
      yield* Console.log(`🔊 Volume set to ${clamped}%`)
    })
).pipe(Command.withDescription("Set playback volume"))

const nowCommand = Command.make("now", {}, () =>
  Effect.gen(function* () {
    const spotify = yield* Spotify
    const state = yield* spotify.getPlaybackState()

    if (!state || !state.item) {
      yield* Console.log(dim("Nothing playing"))
      return
    }

    const item = state.item as { name: string; artists?: { name: string }[]; album?: { name: string }; duration_ms: number }
    const artists = item.artists?.map((a) => a.name).join(", ") ?? "Unknown"
    const album = item.album?.name ?? ""
    const progress = formatDuration(state.progress_ms ?? 0)
    const duration = formatDuration(item.duration_ms)
    const isPlaying = state.is_playing ? green("▶") : yellow("⏸")

    yield* Console.log(`${isPlaying} ${bold(item.name)}`)
    yield* Console.log(`   ${dim("by")} ${artists}`)
    if (album) {
      yield* Console.log(`   ${dim("on")} ${album}`)
    }
    yield* Console.log(`   ${dim(progress + " / " + duration)}`)

    if (state.device) {
      yield* Console.log(`   ${dim("device:")} ${state.device.name}`)
    }
  })
).pipe(Command.withDescription("Show currently playing track"))

const devicesCommand = Command.make("devices", {}, () =>
  Effect.gen(function* () {
    const spotify = yield* Spotify
    const devices = yield* spotify.getDevices()

    if (devices.length === 0) {
      yield* Console.log(dim("No devices found"))
      return
    }

    yield* Console.log(bold("Available devices:\n"))
    for (const device of devices) {
      const active = device.is_active ? green("●") : dim("○")
      const volume = device.volume_percent !== null ? dim(` (${device.volume_percent}%)`) : ""
      yield* Console.log(`${active} ${device.name} ${dim(`[${device.type}]`)}${volume}`)
      yield* Console.log(`  ${dim(device.id ?? "no id")}`)
    }
  })
).pipe(Command.withDescription("List available devices"))

const transferCommand = Command.make(
  "transfer",
  {
    deviceId: Args.text({ name: "device-id" }).pipe(
      Args.withDescription("Target device ID")
    ),
    noPlay: Options.boolean("no-play").pipe(
      Options.withDescription("Don't start playback on transfer")
    ),
  },
  ({ deviceId, noPlay }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      yield* spotify.transferPlayback(deviceId, !noPlay)
      yield* Console.log(`📱 Transferred playback to device`)
    })
).pipe(Command.withDescription("Transfer playback to a device"))

const searchCommand = Command.make(
  "search",
  {
    query: Args.text({ name: "query" }).pipe(
      Args.withDescription("Search query")
    ),
    type: Options.choice("type", ["track", "album", "artist", "playlist", "all"]).pipe(
      Options.withAlias("t"),
      Options.withDefault("all")
    ),
    limit: Options.integer("limit").pipe(
      Options.withAlias("l"),
      Options.withDefault(10)
    ),
  },
  ({ query, type, limit }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      const types =
        type === "all"
          ? (["track", "album", "artist", "playlist"] as const)
          : [type as "track" | "album" | "artist" | "playlist"]

      const results = yield* spotify.search(query, [...types], limit)

      if (results.tracks.length > 0) {
        yield* Console.log(bold("\nTracks:"))
        for (const track of results.tracks) {
          const artists = track.artists.map((a: { name: string }) => a.name).join(", ")
          yield* Console.log(`  ${track.name} ${dim("by")} ${artists}`)
          yield* Console.log(`    ${dim(track.uri)}`)
        }
      }

      if (results.albums.length > 0) {
        yield* Console.log(bold("\nAlbums:"))
        for (const album of results.albums) {
          const artists = album.artists.map((a: { name: string }) => a.name).join(", ")
          yield* Console.log(`  ${album.name} ${dim("by")} ${artists}`)
          yield* Console.log(`    ${dim(album.uri)}`)
        }
      }

      if (results.artists.length > 0) {
        yield* Console.log(bold("\nArtists:"))
        for (const artist of results.artists) {
          yield* Console.log(`  ${artist.name}`)
          yield* Console.log(`    ${dim(artist.uri)}`)
        }
      }

      if (results.playlists.length > 0) {
        yield* Console.log(bold("\nPlaylists:"))
        for (const playlist of results.playlists) {
          if (!playlist?.name) continue
          yield* Console.log(`  ${playlist.name} ${dim(`(${playlist.tracks?.total ?? 0} tracks)`)}`)
          yield* Console.log(`    ${dim(playlist.uri)}`)
        }
      }

      const total =
        results.tracks.length +
        results.albums.length +
        results.artists.length +
        results.playlists.length

      if (total === 0) {
        yield* Console.log(dim("No results found"))
      }
    })
).pipe(Command.withDescription("Search for tracks, albums, artists, or playlists"))

const queueAddCommand = Command.make(
  "add",
  {
    uri: Args.text({ name: "uri" }).pipe(
      Args.withDescription("Track URI/URL to add")
    ),
    device: deviceOption,
  },
  ({ uri, device }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      const parsedUri = parseSpotifyUri(uri)
      yield* spotify.addToQueue(parsedUri, Option.getOrUndefined(device))
      yield* Console.log(`➕ Added to queue: ${dim(parsedUri)}`)
    })
).pipe(Command.withDescription("Add a track to the queue"))

const queueShowCommand = Command.make("show", {}, () =>
  Effect.gen(function* () {
    const spotify = yield* Spotify
    const queue = yield* spotify.getQueue()

    if (queue.currently_playing) {
      const current = queue.currently_playing
      const artists = current.artists?.map((a: { name: string }) => a.name).join(", ") ?? "Unknown"
      yield* Console.log(bold("Now playing:"))
      yield* Console.log(`  ${green("▶")} ${current.name} ${dim("by")} ${artists}`)
    }

    if (queue.queue.length > 0) {
      yield* Console.log(bold("\nUp next:"))
      for (let i = 0; i < Math.min(queue.queue.length, 10); i++) {
        const track = queue.queue[i]!
        const artists = track.artists?.map((a: { name: string }) => a.name).join(", ") ?? "Unknown"
        yield* Console.log(`  ${dim(`${i + 1}.`)} ${track.name} ${dim("by")} ${artists}`)
      }
      if (queue.queue.length > 10) {
        yield* Console.log(dim(`  ... and ${queue.queue.length - 10} more`))
      }
    } else if (!queue.currently_playing) {
      yield* Console.log(dim("Queue is empty"))
    }
  })
).pipe(Command.withDescription("Show the current queue"))

const queueCommand = Command.make("queue", {}).pipe(
  Command.withDescription("Queue operations"),
  Command.withSubcommands([queueAddCommand, queueShowCommand])
)

const shuffleCommand = Command.make(
  "shuffle",
  {
    state: Args.choice([
      ["on", true as const],
      ["off", false as const],
    ]).pipe(Args.withDescription("Shuffle state")),
    device: deviceOption,
  },
  ({ state, device }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      yield* spotify.setShuffle(state, Option.getOrUndefined(device))
      yield* Console.log(`🔀 Shuffle ${state ? "enabled" : "disabled"}`)
    })
).pipe(Command.withDescription("Set shuffle mode"))

const repeatCommand = Command.make(
  "repeat",
  {
    mode: Args.choice([
      ["off", "off" as const],
      ["track", "track" as const],
      ["context", "context" as const],
    ]).pipe(Args.withDescription("Repeat mode")),
    device: deviceOption,
  },
  ({ mode, device }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      yield* spotify.setRepeat(mode, Option.getOrUndefined(device))
      const modeText = mode === "off" ? "disabled" : `set to ${mode}`
      yield* Console.log(`🔁 Repeat ${modeText}`)
    })
).pipe(Command.withDescription("Set repeat mode"))

const seekCommand = Command.make(
  "seek",
  {
    position: Args.text({ name: "position" }).pipe(
      Args.withDescription("Position to seek to (e.g., 1:30 or 90)")
    ),
    device: deviceOption,
  },
  ({ position, device }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify

      let positionMs: number
      if (position.includes(":")) {
        const [minutes, seconds] = position.split(":").map(Number)
        positionMs = ((minutes ?? 0) * 60 + (seconds ?? 0)) * 1000
      } else {
        positionMs = Number(position) * 1000
      }

      yield* spotify.seek(positionMs, Option.getOrUndefined(device))
      yield* Console.log(`⏩ Seeked to ${formatDuration(positionMs)}`)
    })
).pipe(Command.withDescription("Seek to a position in the current track"))

const trackCommand = Command.make(
  "track",
  {
    id: Args.text({ name: "id" }).pipe(
      Args.withDescription("Track ID or URL")
    ),
  },
  ({ id }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      const trackId = extractId(id)
      const track = yield* spotify.getTrack(trackId)

      const artists = track.artists.map((a: { name: string }) => a.name).join(", ")
      yield* Console.log(bold(track.name))
      yield* Console.log(`${dim("by")} ${artists}`)
      yield* Console.log(`${dim("on")} ${track.album.name}`)
      yield* Console.log(`${dim("duration:")} ${formatDuration(track.duration_ms)}`)
      yield* Console.log(`${dim("popularity:")} ${track.popularity}/100`)
      yield* Console.log(`${dim("uri:")} ${track.uri}`)
    })
).pipe(Command.withDescription("Get track details"))

const artistCommand = Command.make(
  "artist",
  {
    id: Args.text({ name: "id" }).pipe(
      Args.withDescription("Artist ID or URL")
    ),
    topTracks: Options.boolean("top-tracks").pipe(
      Options.withAlias("t"),
      Options.withDescription("Show top tracks")
    ),
  },
  ({ id, topTracks }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      const artistId = extractId(id)
      const artist = yield* spotify.getArtist(artistId)

      yield* Console.log(bold(artist.name))
      yield* Console.log(`${dim("genres:")} ${artist.genres.join(", ") || "none"}`)
      yield* Console.log(`${dim("followers:")} ${artist.followers.total.toLocaleString()}`)
      yield* Console.log(`${dim("popularity:")} ${artist.popularity}/100`)
      yield* Console.log(`${dim("uri:")} ${artist.uri}`)

      if (topTracks) {
        const tracks = yield* spotify.getArtistTopTracks(artistId)
        yield* Console.log(bold("\nTop tracks:"))
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i]!
          yield* Console.log(`  ${dim(`${i + 1}.`)} ${track.name}`)
        }
      }
    })
).pipe(Command.withDescription("Get artist details"))

const meCommand = Command.make("me", {}, () =>
  Effect.gen(function* () {
    const spotify = yield* Spotify
    const user = yield* spotify.getCurrentUser()

    yield* Console.log(bold(user.display_name ?? user.id))
    yield* Console.log(`${dim("id:")} ${user.id}`)
    if (user.email) {
      yield* Console.log(`${dim("email:")} ${user.email}`)
    }
  })
).pipe(Command.withDescription("Show current user"))

const playlistsCommand = Command.make(
  "playlists",
  {
    limit: Options.integer("limit").pipe(
      Options.withAlias("l"),
      Options.withDefault(20)
    ),
  },
  ({ limit }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify
      const playlists = yield* spotify.getUserPlaylists(limit)

      yield* Console.log(bold("Your playlists:\n"))
      for (const playlist of playlists) {
        const trackCount = playlist.tracks?.total ?? 0
        yield* Console.log(`${playlist.name} ${dim(`(${trackCount} tracks)`)}`)
        yield* Console.log(`  ${dim(playlist.uri)}`)
      }
    })
).pipe(Command.withDescription("List your playlists"))

const recommendCommand = Command.make(
  "recommend",
  {
    seedTracks: Options.text("track").pipe(
      Options.withAlias("t"),
      Options.withDescription("Seed track ID/URL"),
      Options.repeated
    ),
    seedArtists: Options.text("artist").pipe(
      Options.withAlias("a"),
      Options.withDescription("Seed artist ID/URL"),
      Options.repeated
    ),
    seedGenres: Options.text("genre").pipe(
      Options.withAlias("g"),
      Options.withDescription("Seed genre"),
      Options.repeated
    ),
    limit: Options.integer("limit").pipe(
      Options.withAlias("l"),
      Options.withDefault(10)
    ),
  },
  ({ seedTracks, seedArtists, seedGenres, limit }) =>
    Effect.gen(function* () {
      const spotify = yield* Spotify

      const trackIds = seedTracks.map(extractId)
      const artistIds = seedArtists.map(extractId)

      const tracks = yield* spotify.getRecommendations({
        seedTracks: trackIds.length > 0 ? trackIds : undefined,
        seedArtists: artistIds.length > 0 ? artistIds : undefined,
        seedGenres: seedGenres.length > 0 ? seedGenres : undefined,
        limit,
      })

      yield* Console.log(bold("Recommendations:\n"))
      for (const track of tracks) {
        const artists = track.artists.map((a: { name: string }) => a.name).join(", ")
        yield* Console.log(`${track.name} ${dim("by")} ${artists}`)
        yield* Console.log(`  ${dim(track.uri)}`)
      }
    })
).pipe(Command.withDescription("Get track recommendations based on seeds"))

// Main command
const spotify = Command.make("spotify", {}).pipe(
  Command.withDescription("Control Spotify from the command line"),
  Command.withSubcommands([
    playCommand,
    pauseCommand,
    nextCommand,
    prevCommand,
    volumeCommand,
    nowCommand,
    devicesCommand,
    transferCommand,
    searchCommand,
    queueCommand,
    shuffleCommand,
    repeatCommand,
    seekCommand,
    trackCommand,
    artistCommand,
    meCommand,
    playlistsCommand,
    recommendCommand,
  ])
)

const cli = Command.run(spotify, {
  name: "spotify",
  version: VERSION,
})

// Check if we're running a help or version command (no auth needed)
const isHelpCommand = process.argv.some(
  (arg) => arg === "--help" || arg === "-h" || arg === "--version"
)

// Lazy Spotify layer that only creates API when accessed
const SpotifyLazy = Layer.effect(
  Spotify,
  Effect.gen(function* () {
    const api = yield* createSpotifyApi
    return makeSpotify(api)
  })
)

// Stub layer for help commands
const SpotifyStub = Layer.succeed(
  Spotify,
  makeSpotify(null as unknown as ReturnType<typeof import("@spotify/web-api-ts-sdk").SpotifyApi.withAccessToken>)
)

const program = Effect.suspend(() => cli(process.argv)).pipe(
  Effect.provide(isHelpCommand ? SpotifyStub : SpotifyLazy)
)

program.pipe(
  Effect.catchTags({
    SpotifyError: (e) => Console.error(`Spotify error: ${e.message}`),
    AuthenticationError: (e) => Console.error(`Auth error: ${e.message}`),
  }),
  Effect.catchAll((error) => Console.error(`Error: ${error}`)),
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain
)
