import { Schema } from "effect"

export class Commit extends Schema.Class<Commit>("Commit")({
  sha: Schema.String,
  commit: Schema.Struct({
    message: Schema.String,
    author: Schema.Struct({
      name: Schema.String,
      date: Schema.String,
    }),
  }),
  html_url: Schema.String,
}) {}

export class CommitSearchResult extends Schema.Class<CommitSearchResult>("CommitSearchResult")({
  total_count: Schema.Number,
  incomplete_results: Schema.Boolean,
  items: Schema.Array(
    Schema.Struct({
      sha: Schema.String,
      commit: Schema.Struct({
        message: Schema.String,
        author: Schema.Struct({
          name: Schema.String,
          date: Schema.String,
        }),
      }),
      html_url: Schema.String,
      repository: Schema.Struct({
        full_name: Schema.String,
      }),
    })
  ),
}) {}
