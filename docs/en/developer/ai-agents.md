# AI Agents (llms.txt & WebMCP)

<!-- llms-description: Explains the llms.txt index and the experimental WebMCP tools of the docs site, how to try them in Chrome and how to add pages. -->

Attraccess documentation is easy to consume for AI agents: an `llms.txt` index for crawlers and assistants, and WebMCP tools for agents running inside the browser.

> [!WARNING]
> WebMCP is experimental. The browser API and the tools described here may change without notice.

## llms.txt

`https://docs.attraccess.org/llms.txt` follows the [llms.txt](https://llmstxt.org/) convention. It lists every documentation page, English first and then German, with a link to the raw Markdown file and a one-line description. An agent can read the index and then fetch only the pages it needs, for example:

```text
https://docs.attraccess.org/en/getting-started/overview.md
```

The file is generated from the two sidebars (`docs/en/_sidebar.md` and `docs/de/_sidebar.md`) and committed to the repository. It is available in the same way when the documentation is served by your own Attraccess instance under `/docs/`, but the links in it always point to `docs.attraccess.org`.

## WebMCP tools

In browsers that support [WebMCP](https://webmachinelearning.github.io/webmcp/), the documentation site registers five tools for the browser's AI agent. Nothing happens in other browsers.

| Tool           | Input                                                    | What it does                                                                                          |
| -------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `list_pages`   | `language` (optional: `de` or `en`)                      | Lists all pages from the sidebar with title, section, path and URL.                                   |
| `get_page`     | `path` (for example `en/getting-started/overview.md`)    | Returns the raw Markdown of one page. Paths outside the documentation are rejected.                   |
| `search_docs`  | `query`, `language` (optional), `limit` (optional, 1-20) | Full-text search; all words must match and title matches rank first. Returns titles, paths, snippets. |
| `navigate_to`  | `path`                                                   | Opens a page in the browser. A page in the other language switches the language and reloads.          |
| `set_language` | `language` (`de` or `en`)                                | Switches the site language. The page reloads and the tools are registered again.                      |

`list_pages`, `get_page` and `search_docs` only read. `navigate_to` and `set_language` change what the browser shows, nothing else.

## Try it in Chrome

1. Use Chrome 149 or newer.
2. Open `chrome://flags/#enable-webmcp-testing`, enable the flag and restart Chrome.
3. Open the documentation site and inspect the tools with the Model Context Tool Inspector extension, or with the **Application → WebMCP** panel in DevTools.

Support through a Chrome origin trial is planned, so visitors will not need the flag later.

## Adding or renaming a documentation page

Every page that is linked from a sidebar needs a description for `llms.txt`:

1. Write one sentence (20-200 characters, in the language of the page) as an HTML comment directly below the first heading:

   ```markdown
   # My New Page

   <!-- llms-description: Explains how to do X and which settings Y affects. -->
   ```

2. Add the page to the sidebar of its language.
3. Run `node scripts/generate-llms-txt.mjs` and commit the updated `docs/llms.txt`.

The `lint` and `test` targets run `node scripts/generate-llms-txt.mjs --check` and fail with the affected files if a description is missing or `llms.txt` is out of date.
