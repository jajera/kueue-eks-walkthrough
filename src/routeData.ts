import { defineRouteMiddleware } from "@astrojs/starlight/route-data";

const OG_IMAGE_PATH = "/kueue-eks-walkthrough/og-image.png";
const OG_IMAGE_ALT =
  "Kueue on EKS walkthrough — batch job admission, ClusterQueue quota, and GitOps on Auto Mode";

export const onRequest = defineRouteMiddleware((context) => {
  const { head } = context.locals.starlightRoute;
  const ogImageUrl = new URL(OG_IMAGE_PATH, context.site);

  head.push({
    tag: "meta",
    attrs: { property: "og:image", content: ogImageUrl.href },
  });
  head.push({
    tag: "meta",
    attrs: { property: "og:image:width", content: "1200" },
  });
  head.push({
    tag: "meta",
    attrs: { property: "og:image:height", content: "630" },
  });
  head.push({
    tag: "meta",
    attrs: { property: "og:image:alt", content: OG_IMAGE_ALT },
  });
  head.push({
    tag: "meta",
    attrs: { name: "twitter:card", content: "summary_large_image" },
  });
  head.push({
    tag: "meta",
    attrs: { name: "twitter:image", content: ogImageUrl.href },
  });
});
