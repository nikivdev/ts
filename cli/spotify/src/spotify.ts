import { Context, Effect, Layer, Config, Redacted } from "effect"
import { TaggedError } from "effect/Data"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import type {
  Track,
  SimplifiedAlbum,
  Artist,
  SimplifiedPlaylist,
  PlaybackState,
  Device,
  Page,
} from "@spotify/web-api-ts-sdk"

export class SpotifyError extends TaggedError("SpotifyError")<{
  message: string
  cause?: unknown
}> {}

export class AuthenticationError extends TaggedError("AuthenticationError")<{
  message: string
}> {}

export interface SearchResult {
  tracks: Track[]
  albums: SimplifiedAlbum[]
  artists: Artist[]
  playlists: SimplifiedPlaylist[]
}

export class Spotify extends Context.Tag("Spotify")<
  Spotify,
  {
    readonly search: (
      query: string,
      types: ("track" | "album" | "artist" | "playlist")[],
      limit?: number
    ) => Effect.Effect<SearchResult, SpotifyError>

    readonly play: (options?: {
      uri?: string
      deviceId?: string
      contextUri?: string
      positionMs?: number
    }) => Effect.Effect<void, SpotifyError>

    readonly pause: (deviceId?: string) => Effect.Effect<void, SpotifyError>

    readonly next: (deviceId?: string) => Effect.Effect<void, SpotifyError>

    readonly previous: (deviceId?: string) => Effect.Effect<void, SpotifyError>

    readonly setVolume: (
      volumePercent: number,
      deviceId?: string
    ) => Effect.Effect<void, SpotifyError>

    readonly getPlaybackState: () => Effect.Effect<PlaybackState | null, SpotifyError>

    readonly getDevices: () => Effect.Effect<Device[], SpotifyError>

    readonly transferPlayback: (
      deviceId: string,
      play?: boolean
    ) => Effect.Effect<void, SpotifyError>

    readonly addToQueue: (uri: string, deviceId?: string) => Effect.Effect<void, SpotifyError>

    readonly getQueue: () => Effect.Effect<
      { currently_playing: Track | null; queue: Track[] },
      SpotifyError
    >

    readonly getCurrentUser: () => Effect.Effect<
      { id: string; display_name: string | null; email?: string },
      SpotifyError
    >

    readonly getTrack: (id: string) => Effect.Effect<Track, SpotifyError>

    readonly getAlbum: (
      id: string
    ) => Effect.Effect<SimplifiedAlbum & { tracks: Page<Track> }, SpotifyError>

    readonly getArtist: (id: string) => Effect.Effect<Artist, SpotifyError>

    readonly getArtistTopTracks: (
      id: string,
      market?: string
    ) => Effect.Effect<Track[], SpotifyError>

    readonly getRecommendations: (options: {
      seedTracks?: string[]
      seedArtists?: string[]
      seedGenres?: string[]
      limit?: number
    }) => Effect.Effect<Track[], SpotifyError>

    readonly createPlaylist: (
      name: string,
      options?: { description?: string; public?: boolean }
    ) => Effect.Effect<SimplifiedPlaylist, SpotifyError>

    readonly addTracksToPlaylist: (
      playlistId: string,
      uris: string[]
    ) => Effect.Effect<void, SpotifyError>

    readonly getUserPlaylists: (
      limit?: number
    ) => Effect.Effect<SimplifiedPlaylist[], SpotifyError>

    readonly setShuffle: (
      state: boolean,
      deviceId?: string
    ) => Effect.Effect<void, SpotifyError>

    readonly setRepeat: (
      state: "track" | "context" | "off",
      deviceId?: string
    ) => Effect.Effect<void, SpotifyError>

    readonly seek: (
      positionMs: number,
      deviceId?: string
    ) => Effect.Effect<void, SpotifyError>
  }
>() {}

const wrapSpotifyCall = <T>(
  fn: () => Promise<T>,
  errorMessage: string
): Effect.Effect<T, SpotifyError> =>
  Effect.tryPromise({
    try: fn,
    catch: (error) =>
      new SpotifyError({
        message: errorMessage,
        cause: error,
      }),
  })

export const makeSpotify = (api: SpotifyApi) =>
  Spotify.of({
    search: (query, types, limit = 20) =>
      wrapSpotifyCall(
        async () => {
          const result = await api.search(query, types, undefined, limit)
          return {
            tracks: result.tracks?.items ?? [],
            albums: result.albums?.items ?? [],
            artists: result.artists?.items ?? [],
            playlists: result.playlists?.items ?? [],
          }
        },
        `Failed to search for "${query}"`
      ),

    play: (options) =>
      wrapSpotifyCall(async () => {
        if (options?.uri) {
          const isContext =
            options.uri.includes(":album:") ||
            options.uri.includes(":playlist:") ||
            options.uri.includes(":artist:")

          if (isContext) {
            await api.player.startResumePlayback(
              options.deviceId ?? "",
              options.uri,
              undefined,
              undefined,
              options.positionMs
            )
          } else {
            await api.player.startResumePlayback(
              options.deviceId ?? "",
              options.contextUri,
              undefined,
              { uri: options.uri },
              options.positionMs
            )
          }
        } else {
          await api.player.startResumePlayback(options?.deviceId ?? "")
        }
      }, "Failed to start playback"),

    pause: (deviceId) =>
      wrapSpotifyCall(
        () => api.player.pausePlayback(deviceId ?? ""),
        "Failed to pause playback"
      ),

    next: (deviceId) =>
      wrapSpotifyCall(
        () => api.player.skipToNext(deviceId ?? ""),
        "Failed to skip to next track"
      ),

    previous: (deviceId) =>
      wrapSpotifyCall(
        () => api.player.skipToPrevious(deviceId ?? ""),
        "Failed to skip to previous track"
      ),

    setVolume: (volumePercent, deviceId) =>
      wrapSpotifyCall(
        () => api.player.setPlaybackVolume(volumePercent, deviceId ?? ""),
        "Failed to set volume"
      ),

    getPlaybackState: () =>
      wrapSpotifyCall(
        () => api.player.getPlaybackState(),
        "Failed to get playback state"
      ),

    getDevices: () =>
      wrapSpotifyCall(async () => {
        const result = await api.player.getAvailableDevices()
        return result.devices
      }, "Failed to get devices"),

    transferPlayback: (deviceId, play = true) =>
      wrapSpotifyCall(
        () => api.player.transferPlayback([deviceId], play),
        "Failed to transfer playback"
      ),

    addToQueue: (uri, deviceId) =>
      wrapSpotifyCall(
        () => api.player.addItemToPlaybackQueue(uri, deviceId),
        "Failed to add to queue"
      ),

    getQueue: () =>
      wrapSpotifyCall(async () => {
        const queue = await api.player.getUsersQueue()
        return {
          currently_playing: queue.currently_playing as Track | null,
          queue: queue.queue as Track[],
        }
      }, "Failed to get queue"),

    getCurrentUser: () =>
      wrapSpotifyCall(async () => {
        const user = await api.currentUser.profile()
        return {
          id: user.id,
          display_name: user.display_name,
          email: user.email,
        }
      }, "Failed to get current user"),

    getTrack: (id) =>
      wrapSpotifyCall(() => api.tracks.get(id), `Failed to get track ${id}`),

    getAlbum: (id) =>
      wrapSpotifyCall(
        () => api.albums.get(id) as Promise<SimplifiedAlbum & { tracks: Page<Track> }>,
        `Failed to get album ${id}`
      ),

    getArtist: (id) =>
      wrapSpotifyCall(() => api.artists.get(id), `Failed to get artist ${id}`),

    getArtistTopTracks: (id, market = "US") =>
      wrapSpotifyCall(
        () => api.artists.topTracks(id, market),
        `Failed to get top tracks for artist ${id}`
      ),

    getRecommendations: (options) =>
      wrapSpotifyCall(async () => {
        const result = await api.recommendations.get({
          seed_tracks: options.seedTracks ?? [],
          seed_artists: options.seedArtists ?? [],
          seed_genres: options.seedGenres ?? [],
          limit: options.limit ?? 20,
        })
        return result.tracks
      }, "Failed to get recommendations"),

    createPlaylist: (name, options) =>
      wrapSpotifyCall(async () => {
        const user = await api.currentUser.profile()
        return api.playlists.createPlaylist(user.id, {
          name,
          description: options?.description,
          public: options?.public ?? false,
        })
      }, `Failed to create playlist "${name}"`),

    addTracksToPlaylist: (playlistId, uris) =>
      wrapSpotifyCall(async () => {
        await api.playlists.addItemsToPlaylist(playlistId, uris)
      }, `Failed to add tracks to playlist ${playlistId}`),

    getUserPlaylists: (limit = 50) =>
      wrapSpotifyCall(async () => {
        const result = await api.currentUser.playlists.playlists(limit)
        return result.items
      }, "Failed to get user playlists"),

    setShuffle: (state, deviceId) =>
      wrapSpotifyCall(
        () => api.player.togglePlaybackShuffle(state, deviceId ?? ""),
        "Failed to set shuffle"
      ),

    setRepeat: (state, deviceId) =>
      wrapSpotifyCall(
        () => api.player.setRepeatMode(state, deviceId ?? ""),
        "Failed to set repeat mode"
      ),

    seek: (positionMs, deviceId) =>
      wrapSpotifyCall(
        () => api.player.seekToPosition(positionMs, deviceId ?? ""),
        "Failed to seek"
      ),
  })

export const SpotifyLive = (api: SpotifyApi) => Layer.succeed(Spotify, makeSpotify(api))

export const getSpotifyConfig = Effect.gen(function* () {
  const clientId = yield* Config.string("SPOTIFY_CLIENT_ID").pipe(
    Effect.orElseFail(
      () =>
        new AuthenticationError({
          message:
            "SPOTIFY_CLIENT_ID is required. Set it via: export SPOTIFY_CLIENT_ID=your_client_id",
        })
    )
  )
  const clientSecret = yield* Config.redacted("SPOTIFY_CLIENT_SECRET").pipe(
    Effect.orElseFail(
      () =>
        new AuthenticationError({
          message:
            "SPOTIFY_CLIENT_SECRET is required. Set it via: export SPOTIFY_CLIENT_SECRET=your_client_secret",
        })
    )
  )

  return {
    clientId,
    clientSecret: Redacted.value(clientSecret),
  }
})

export const getSpotifyToken = Effect.gen(function* () {
  const token = yield* Config.redacted("SPOTIFY_ACCESS_TOKEN").pipe(
    Effect.orElseSucceed(() => Redacted.make(""))
  )
  const tokenValue = Redacted.value(token)

  if (!tokenValue) {
    return { accessToken: null, refreshToken: undefined }
  }

  const refreshToken = yield* Config.redacted("SPOTIFY_REFRESH_TOKEN").pipe(
    Effect.orElseSucceed(() => Redacted.make(""))
  )

  return {
    accessToken: tokenValue,
    refreshToken: Redacted.value(refreshToken) || undefined,
  }
})

export const createSpotifyApi = Effect.gen(function* () {
  const { clientId, clientSecret } = yield* getSpotifyConfig
  const { accessToken, refreshToken } = yield* getSpotifyToken

  // If access token provided, use it (for user-specific endpoints)
  if (accessToken) {
    const token = {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken ?? "",
    }
    return SpotifyApi.withAccessToken(clientId, token)
  }

  // Otherwise use client credentials (for public endpoints like search, track info)
  return SpotifyApi.withClientCredentials(clientId, clientSecret)
})
