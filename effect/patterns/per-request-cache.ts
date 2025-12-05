import {
  FetchHttpClient,
  HttpClient,
  type HttpClientError,
  HttpClientResponse,
} from "@effect/platform"
import {
  Console,
  Effect,
  type ParseResult,
  Request,
  RequestResolver,
  Schema,
} from "effect"

const Pokemon = Schema.Struct({ name: Schema.String, id: Schema.Number })

class GetPokemon extends Request.TaggedClass("GetPokemon")<
  typeof Pokemon.Type,
  HttpClientError.HttpClientError | ParseResult.ParseError,
  { readonly id: number }
> {}

const PokemonResolver = RequestResolver.fromEffect((req: GetPokemon) =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching pokemon #${req.id}...`)
    const res = yield* HttpClient.get(
      `https://pokeapi.co/api/v2/pokemon/${req.id}`
    )
    return yield* HttpClientResponse.schemaBodyJson(Pokemon)(res)
  })
).pipe(RequestResolver.contextFromServices(HttpClient.HttpClient))

const getPokemon = (id: number) =>
  Effect.request(new GetPokemon({ id }), PokemonResolver)

// Fetch the same Pokemon 3 times - only 1 HTTP call!
const program = Effect.gen(function* () {
  const pokemon = yield* Effect.all([
    getPokemon(25), // Pikachu
    getPokemon(25), // Cached!
    getPokemon(25), // Cached!
  ]).pipe(Effect.withRequestCaching(true))

  yield* Console.log(`Got: ${pokemon.map((p) => p.name).join(", ")}`)
}).pipe(Effect.provide(FetchHttpClient.layer))

Effect.runPromise(program)

// Output:
// Fetching pokemon #25...
// Got: pikachu, pikachu, pikachu
