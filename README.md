# kueue-eks-walkthrough

Batch job queuing on EKS with Kueue queues fair share and Argo CD deploy steps.

CLI lab and walkthrough site for deploying Kueue on Amazon EKS Auto Mode with eksctl and GitOps.

## Local preview

```bash
npm install
npm run dev
```

Open the URL Astro prints (default `http://localhost:4321/kueue-eks-walkthrough/`).

## Production site

`https://jajera.github.io/kueue-eks-walkthrough/` after GitHub Pages deploy.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/content/docs/` | Walkthrough pages (Astro Starlight) |
| `scripts/` | Diagram generators |
| `public/` | Static assets (diagrams, favicon) |
| `demo/` | Lab working directory (gitignored) — create manifests only here |

## Lab quick start

See the site **Deploy and Operate** section or start at `src/content/docs/deploy-and-operate/prerequisites.mdx`.
