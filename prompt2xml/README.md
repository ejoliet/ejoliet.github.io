# prompt-to-xml

Single-file web page that restructures a plain prompt into XML sections for Claude, Claude Code, ChatGPT, and Codex. Inference runs in the browser with [WebLLM](https://github.com/mlc-ai/web-llm) on WebGPU. No server, no API keys, no telemetry.

## Run

```bash
cd prompt-to-xml
python3 -m http.server 8000
# open http://localhost:8000/
```

`file://` does not work: browsers block module loading and model caching there.

Requires a browser with WebGPU (recent Chrome or Edge; Safari with WebGPU enabled).

## Fully offline

The page loads `./vendor/web-llm.js` first, then falls back to jsDelivr (pinned 0.2.85). To remove the CDN dependency:

```bash
mkdir -p vendor
curl -fL -o vendor/web-llm.js https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/lib/index.js
```

Model weights download once from Hugging Face on first load, then load from the browser cache.

## How it works

1. The local model fills a JSON schema (constrained decoding), never free-form XML.
2. The page builds the XML deterministically, so tags are always balanced.
3. Checks run on the result: well-formedness, tag collisions in content, source-word coverage, and new words that may signal invented content.

Targets: Claude and ChatGPT get core sections. Claude Code and Codex add `<files>`, `<commands>`, `<verification>`. Codex downloads as Markdown; Copy Markdown works for every target.

## Manual test

1. Load `Qwen2.5-3B-Instruct` (default). Wait for "Ready."
2. Paste a prompt with a role, steps, a length limit, and a code block. Convert.
3. Expect: well-formed, coverage of 90% or more, code block intact.
4. Switch to Claude Code with a prompt that mentions `src/app.py` and `pytest`. Expect `<files>` and `<commands>`.
5. Reload the page. The model should auto-load from cache without downloading.

## License

MIT
