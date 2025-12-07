import { Context, Effect, Layer, Schema, Stream } from "effect"
import { TaggedError } from "effect/Data"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform"

// =============================================================================
// Errors
// =============================================================================

export class R2Error extends TaggedError("R2Error")<{
  operation: string
  message: string
  status?: number
}> {}

export class R2NotFoundError extends TaggedError("R2NotFoundError")<{
  bucket: string
  key: string
}> {}

// =============================================================================
// Types
// =============================================================================

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export interface R2Object {
  key: string
  size: number
  etag: string
  lastModified: Date
  httpMetadata?: {
    contentType?: string
    contentLanguage?: string
    contentDisposition?: string
    contentEncoding?: string
    cacheControl?: string
    cacheExpiry?: Date
  }
  customMetadata?: Record<string, string>
}

export interface R2ListResult {
  objects: R2Object[]
  truncated: boolean
  cursor?: string
  delimitedPrefixes: string[]
}

export interface R2PutOptions {
  contentType?: string
  contentDisposition?: string
  cacheControl?: string
  customMetadata?: Record<string, string>
}

export interface R2ListOptions {
  prefix?: string
  delimiter?: string
  cursor?: string
  limit?: number
}

// =============================================================================
// AWS Signature V4
// =============================================================================

const hmacSha256 = async (key: ArrayBuffer | string, message: string): Promise<ArrayBuffer> => {
  const encoder = new TextEncoder()
  const keyData = typeof key === "string" ? encoder.encode(key) : key
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message))
}

const sha256 = async (message: string | ArrayBuffer): Promise<string> => {
  const data = typeof message === "string" ? new TextEncoder().encode(message) : message
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

const getSignatureKey = async (
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> => {
  const kDate = await hmacSha256(`AWS4${secretKey}`, dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  return hmacSha256(kService, "aws4_request")
}

interface SignedRequest {
  url: string
  headers: Record<string, string>
}

const signRequest = async (
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | ArrayBuffer,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
): Promise<SignedRequest> => {
  const parsedUrl = new URL(url)
  const service = "s3"

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
  const dateStamp = amzDate.slice(0, 8)

  const payloadHash = await sha256(body)

  const signedHeaders: Record<string, string> = {
    ...headers,
    host: parsedUrl.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  }

  const sortedHeaderKeys = Object.keys(signedHeaders).sort()
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k.toLowerCase()}:${signedHeaders[k]?.trim()}`)
    .join("\n")
  const signedHeadersStr = sortedHeaderKeys.map((k) => k.toLowerCase()).join(";")

  const canonicalUri = parsedUrl.pathname
  const canonicalQuerystring = parsedUrl.search.slice(1)

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders + "\n",
    signedHeadersStr,
    payloadHash,
  ].join("\n")

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n")

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service)
  const signature = toHex(await hmacSha256(signingKey, stringToSign))

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`

  return {
    url,
    headers: {
      ...signedHeaders,
      Authorization: authorizationHeader,
    },
  }
}

// =============================================================================
// R2 Service
// =============================================================================

export interface R2Service {
  readonly config: R2Config

  get: (key: string) => Effect.Effect<ArrayBuffer, R2Error | R2NotFoundError>

  getText: (key: string) => Effect.Effect<string, R2Error | R2NotFoundError>

  getJson: <T>(key: string) => Effect.Effect<T, R2Error | R2NotFoundError>

  put: (
    key: string,
    body: string | ArrayBuffer | Uint8Array,
    options?: R2PutOptions,
  ) => Effect.Effect<R2Object, R2Error>

  putJson: <T>(key: string, data: T, options?: R2PutOptions) => Effect.Effect<R2Object, R2Error>

  delete: (key: string) => Effect.Effect<void, R2Error>

  deleteMany: (keys: string[]) => Effect.Effect<void, R2Error>

  head: (key: string) => Effect.Effect<R2Object, R2Error | R2NotFoundError>

  list: (options?: R2ListOptions) => Effect.Effect<R2ListResult, R2Error>

  listAll: (prefix?: string) => Effect.Effect<R2Object[], R2Error>

  exists: (key: string) => Effect.Effect<boolean, R2Error>

  copy: (sourceKey: string, destKey: string) => Effect.Effect<R2Object, R2Error | R2NotFoundError>
}

export class R2 extends Context.Tag("R2")<R2, R2Service>() {}

// =============================================================================
// R2 Layer
// =============================================================================

export const makeR2 = (config: R2Config) => {
  const baseUrl = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`
  const region = "auto"

  const makeRequest = (
    method: string,
    key: string,
    body: string | ArrayBuffer = "",
    extraHeaders: Record<string, string> = {},
  ) =>
    Effect.gen(function* () {
      const url = `${baseUrl}/${encodeURIComponent(key)}`
      const signed = yield* Effect.promise(() =>
        signRequest(
          method,
          url,
          extraHeaders,
          body,
          config.accessKeyId,
          config.secretAccessKey,
          region,
        ),
      )
      return signed
    })

  const service: R2Service = {
    config,

    get: (key) =>
      Effect.gen(function* () {
        const { url, headers } = yield* makeRequest("GET", key)
        const client = yield* HttpClient.HttpClient

        const response = yield* client.get(url, { headers }).pipe(
          Effect.mapError(
            (e) => new R2Error({ operation: "get", message: String(e) }),
          ),
        )

        if (response.status === 404) {
          return yield* Effect.fail(
            new R2NotFoundError({ bucket: config.bucket, key }),
          )
        }

        if (response.status < 200 || response.status >= 300) {
          const body = yield* response.text.pipe(Effect.orElse(() => Effect.succeed("")))
          return yield* Effect.fail(
            new R2Error({ operation: "get", message: body, status: response.status }),
          )
        }

        return yield* response.arrayBuffer
      }),

    getText: (key) =>
      Effect.gen(function* () {
        const buffer = yield* service.get(key)
        return new TextDecoder().decode(buffer)
      }),

    getJson: <T>(key: string) =>
      Effect.gen(function* () {
        const text = yield* service.getText(key)
        return JSON.parse(text) as T
      }),

    put: (key, body, options = {}) =>
      Effect.gen(function* () {
        const bodyBuffer =
          typeof body === "string"
            ? new TextEncoder().encode(body)
            : body instanceof Uint8Array
              ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
              : body

        const headers: Record<string, string> = {}
        if (options.contentType) headers["Content-Type"] = options.contentType
        if (options.cacheControl) headers["Cache-Control"] = options.cacheControl
        if (options.contentDisposition) {
          headers["Content-Disposition"] = options.contentDisposition
        }
        if (options.customMetadata) {
          for (const [k, v] of Object.entries(options.customMetadata)) {
            headers[`x-amz-meta-${k}`] = v
          }
        }

        const { url, headers: signedHeaders } = yield* makeRequest(
          "PUT",
          key,
          bodyBuffer,
          headers,
        )
        const client = yield* HttpClient.HttpClient

        const response = yield* client
          .execute(
            HttpClientRequest.put(url).pipe(
              HttpClientRequest.setHeaders(signedHeaders),
              HttpClientRequest.arrayBuffer(bodyBuffer),
            ),
          )
          .pipe(Effect.mapError((e) => new R2Error({ operation: "put", message: String(e) })))

        if (response.status < 200 || response.status >= 300) {
          const responseBody = yield* response.text.pipe(Effect.orElse(() => Effect.succeed("")))
          return yield* Effect.fail(
            new R2Error({ operation: "put", message: responseBody, status: response.status }),
          )
        }

        const etag = response.headers["etag"] ?? ""
        return {
          key,
          size: bodyBuffer.byteLength,
          etag,
          lastModified: new Date(),
          httpMetadata: {
            contentType: options.contentType,
            cacheControl: options.cacheControl,
            contentDisposition: options.contentDisposition,
          },
          customMetadata: options.customMetadata,
        }
      }),

    putJson: (key, data, options = {}) =>
      service.put(key, JSON.stringify(data), {
        ...options,
        contentType: options.contentType ?? "application/json",
      }),

    delete: (key) =>
      Effect.gen(function* () {
        const { url, headers } = yield* makeRequest("DELETE", key)
        const client = yield* HttpClient.HttpClient

        const response = yield* client
          .execute(
            HttpClientRequest.del(url).pipe(HttpClientRequest.setHeaders(headers)),
          )
          .pipe(Effect.mapError((e) => new R2Error({ operation: "delete", message: String(e) })))

        if (response.status < 200 || response.status >= 300 && response.status !== 404) {
          const body = yield* response.text.pipe(Effect.orElse(() => Effect.succeed("")))
          return yield* Effect.fail(
            new R2Error({ operation: "delete", message: body, status: response.status }),
          )
        }
      }),

    deleteMany: (keys) =>
      Effect.gen(function* () {
        yield* Effect.forEach(keys, service.delete, { concurrency: 10 })
      }),

    head: (key) =>
      Effect.gen(function* () {
        const { url, headers } = yield* makeRequest("HEAD", key)
        const client = yield* HttpClient.HttpClient

        const response = yield* client
          .execute(
            HttpClientRequest.head(url).pipe(HttpClientRequest.setHeaders(headers)),
          )
          .pipe(Effect.mapError((e) => new R2Error({ operation: "head", message: String(e) })))

        if (response.status === 404) {
          return yield* Effect.fail(
            new R2NotFoundError({ bucket: config.bucket, key }),
          )
        }

        if (response.status < 200 || response.status >= 300) {
          return yield* Effect.fail(
            new R2Error({ operation: "head", message: "HEAD failed", status: response.status }),
          )
        }

        const contentLength = response.headers["content-length"]
        const etag = response.headers["etag"]
        const lastModified = response.headers["last-modified"]
        const contentType = response.headers["content-type"]

        return {
          key,
          size: contentLength ? parseInt(contentLength, 10) : 0,
          etag: etag ?? "",
          lastModified: lastModified ? new Date(lastModified) : new Date(),
          httpMetadata: {
            contentType,
          },
        }
      }),

    list: (options = {}) =>
      Effect.gen(function* () {
        const params = new URLSearchParams()
        params.set("list-type", "2")
        if (options.prefix) params.set("prefix", options.prefix)
        if (options.delimiter) params.set("delimiter", options.delimiter)
        if (options.cursor) params.set("continuation-token", options.cursor)
        if (options.limit) params.set("max-keys", String(options.limit))

        const url = `${baseUrl}?${params.toString()}`
        const signed = yield* Effect.promise(() =>
          signRequest("GET", url, {}, "", config.accessKeyId, config.secretAccessKey, region),
        )

        const client = yield* HttpClient.HttpClient
        const response = yield* client
          .get(signed.url, { headers: signed.headers })
          .pipe(Effect.mapError((e) => new R2Error({ operation: "list", message: String(e) })))

        if (response.status < 200 || response.status >= 300) {
          const body = yield* response.text.pipe(Effect.orElse(() => Effect.succeed("")))
          return yield* Effect.fail(
            new R2Error({ operation: "list", message: body, status: response.status }),
          )
        }

        const xml = yield* response.text

        // Simple XML parsing for list results
        const getTag = (tag: string, text: string): string | undefined => {
          const match = text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
          return match?.[1]
        }

        const getAllTags = (tag: string, text: string): string[] => {
          const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g")
          const results: string[] = []
          let match
          while ((match = regex.exec(text)) !== null) {
            if (match[1]) results.push(match[1])
          }
          return results
        }

        const getContents = (text: string): R2Object[] => {
          const objects: R2Object[] = []
          const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g
          let match
          while ((match = contentsRegex.exec(text)) !== null) {
            const content = match[1] ?? ""
            const key = getTag("Key", content)
            const size = getTag("Size", content)
            const etag = getTag("ETag", content)
            const lastModified = getTag("LastModified", content)
            if (key) {
              objects.push({
                key,
                size: size ? parseInt(size, 10) : 0,
                etag: etag?.replace(/"/g, "") ?? "",
                lastModified: lastModified ? new Date(lastModified) : new Date(),
              })
            }
          }
          return objects
        }

        const truncated = getTag("IsTruncated", xml) === "true"
        const cursor = getTag("NextContinuationToken", xml)
        const prefixes = getAllTags("Prefix", xml).filter(
          (p) => xml.includes(`<CommonPrefixes><Prefix>${p}</Prefix></CommonPrefixes>`),
        )

        return {
          objects: getContents(xml),
          truncated,
          cursor,
          delimitedPrefixes: prefixes,
        }
      }),

    listAll: (prefix) =>
      Effect.gen(function* () {
        const allObjects: R2Object[] = []
        let cursor: string | undefined

        do {
          const result = yield* service.list({ prefix, cursor, limit: 1000 })
          allObjects.push(...result.objects)
          cursor = result.truncated ? result.cursor : undefined
        } while (cursor)

        return allObjects
      }),

    exists: (key) =>
      service.head(key).pipe(
        Effect.map(() => true),
        Effect.catchTag("R2NotFoundError", () => Effect.succeed(false)),
      ),

    copy: (sourceKey, destKey) =>
      Effect.gen(function* () {
        const data = yield* service.get(sourceKey)
        const sourceMeta = yield* service.head(sourceKey)
        return yield* service.put(destKey, data, {
          contentType: sourceMeta.httpMetadata?.contentType,
          customMetadata: sourceMeta.customMetadata,
        })
      }),
  }

  return service
}

export const R2Live = (config: R2Config) =>
  Layer.succeed(R2, makeR2(config)).pipe(Layer.provide(FetchHttpClient.layer))
