import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightThemeVintage from "starlight-theme-vintage";
import { starlightBasePath } from "starlight-base-path";

export default defineConfig({
  site: "https://jajera.github.io",
  base: "/kueue-eks-walkthrough/",
  integrations: [
    starlight({
      title: "Kueue on EKS",
      favicon: "/favicon.svg",
      description:
        "Batch job queuing on EKS with Kueue queues fair share and Argo CD deploy steps.",
      plugins: [starlightThemeVintage(), starlightBasePath()],
      routeMiddleware: "./src/routeData.ts",
      customCss: ["./src/styles/splash-overrides.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/jajera/kueue-eks-walkthrough",
        },
      ],
      editLink: {
        baseUrl:
          "https://github.com/jajera/kueue-eks-walkthrough/edit/main/",
      },
      lastUpdated: true,
      pagination: true,
      sidebar: [
        { label: "Home", link: "/" },
        {
          label: "Concepts",
          items: [
            { slug: "concepts/what-is-kueue" },
            { slug: "concepts/layers" },
          ],
        },
        {
          label: "Architecture",
          items: [{ slug: "architecture/overview" }],
        },
        {
          label: "Deploy and Operate",
          items: [
            { slug: "deploy-and-operate/prerequisites" },
            { slug: "deploy-and-operate/cluster-auto-mode" },
            { slug: "deploy-and-operate/argocd-capability" },
            { slug: "deploy-and-operate/kueue-gitops" },
            { slug: "deploy-and-operate/queues" },
            { slug: "deploy-and-operate/kueueviz" },
            { slug: "deploy-and-operate/verify-batch" },
            { slug: "deploy-and-operate/teardown" },
          ],
        },
        {
          label: "Reference",
          items: [
            { slug: "reference/keda-vs-kueue" },
            { slug: "reference/manifest-reference" },
            { slug: "reference/troubleshooting" },
          ],
        },
      ],
    }),
  ],
});
