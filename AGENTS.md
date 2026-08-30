# Agent notes

## Repos

| Repo | Role |
|------|------|
| `jajera/kueue-eks-walkthrough` | This docs site (GitHub Pages) |

Do not invent AWS account IDs, cluster names, or custom domains for the lab. Use placeholder values and default `*.amazonaws.com` endpoints only.

## Docs source of truth

Walkthrough steps live in `src/content/docs/**/*.mdx`. Keep sidebar slugs in `astro.config.mjs` aligned with those files.

## Lab artifacts

The `demo/` directory is the lab working directory and is gitignored. Create manifests only there — never commit generated lab artifacts.

## Site URL

Production docs: `https://kueue-eks-walkthrough.johna.kiwi` (Pages + Route 53 CNAME via johna-kiwi-infra `sites.yaml`).
