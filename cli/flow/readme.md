# flow

> CLI to do things fast

## Usage

Running the command without arguments prints the built-in help:

```
flow-ts 0.1
CLI to do things fast

Commands:
  clearGhNotifs   Clear GitHub notifications (placeholder)
  sendEmail       Send email through Resend using Markdown templates (default: ~/.config/friendik/email/send.md)
  clone           Clone a repo into ~/gh/<namespace>/<repo>
  createSplToken  Create an SPL token using Solana + SPL Token CLI (with optional minting and metadata)

Flags:
  --version, -v   Show CLI version
  --help          Show command-specific help

Examples:
  flow-ts sendEmail --help
  flow-ts clone git@github.com:user/repo.git
  flow-ts createSplToken --name "My Token" --symbol MYT --supply 1000 --metadata-uri https://example.com/meta.json
```

### Commands

- `flow-ts clearGhNotifs` – placeholder that currently just prints a stub message.
- `flow-ts sendEmail` – renders a Markdown template and sends it through the Resend API.
- `flow-ts clone <repo>` – clones a Git repository into `~/gh/<namespace>/<repo>` after validating the path.
- `flow-ts createSplToken` – end-to-end helper for creating a Solana SPL token with the Solana + SPL Token CLI. It:
  - Ensures `solana`, `solana-keygen`, and `spl-token` are available.
  - Generates a keypair at `~/.config/solana/id.json` if missing.
  - (Devnet) Airdrops 2 SOL by default (`--airdrop 0` to skip).
  - Creates the mint with `--decimals` (default `9`).
  - Creates your associated token account.
  - Optionally mints an initial supply (`--supply <tokens>`, skip when 0).
  - Optionally attaches metadata (`--metadata-uri ...` with `--name`/`--symbol`).
  - Optionally disables mint/freeze authority (`--disable-mint-authority true`, `--disable-freeze-authority true`).
  - Cluster defaults to devnet; pass `--cluster mainnet-beta` or a custom RPC URL if needed.

### Sending email with Resend

`flow-ts sendEmail` expects `RESEND_API_KEY` to be present in your environment. It resolves the email template from (in order):

1. `--content` / `--file` CLI flag
2. `RESEND_CONTENT`
3. `~/.config/friendik/email/send.md`

The template is Markdown with YAML front matter. A minimal example:

```
---
from: team@example.com
to:
  - you@example.com
subject: Launch Update
---

# Launch Update

Body content in Markdown...
```

You can supply `cc`, `bcc`, and `replyTo` fields in the front matter or via `RESEND_CC`, `RESEND_BCC`, and `RESEND_REPLY_TO`. CLI flags (`--from`, `--to`, `--subject`) and their corresponding environment variables override the template values when present.
