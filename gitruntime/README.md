# GitRuntime

Static GitHub Pages prototype. It turns a public GitHub repository into an evidence-backed runtime contract: runtime/toolchain, external services, deployment surface, ports, configuration variables, and likely commands.

## URL model

With a custom domain pointed at this GitHub Pages site:

    https://gitruntime.62633.xyz/apache/airflow

Without a custom domain, for a project repository named `gitruntime` under user `ejoliet`:

    https://ejoliet.github.io/gitruntime/apache/airflow

`404.html` intentionally duplicates the app so GitHub Pages can handle arbitrary `/owner/repo` paths.

## Deploy

1. Create a public repository named `gitruntime`.
2. Put `index.html`, `404.html`, and this README at the repository root.
3. In GitHub: Settings -> Pages -> Deploy from branch -> `main` / root.
4. Optional: configure a custom domain. A root-level custom domain gives the cleanest domain-swap UX.

No build step is required.

## Constraints

- Public GitHub repositories only.
- Uses unauthenticated GitHub REST calls for repository metadata and the recursive tree.
- GitHub's unauthenticated REST limit is 60 requests/hour per source IP.
- The analysis is heuristic. It reads a bounded set of high-signal configuration/documentation files and links each finding back to evidence.
