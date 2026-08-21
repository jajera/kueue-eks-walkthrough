import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const iconsDir = join(root, "public/diagram-icons");
const publicDir = join(root, "public");

/** CNCF / Kubernetes icons — https://jajera.github.io/cncf-icons/ */
const CNCF_ICONS_BASE = "https://jajera.github.io/cncf-icons";
/** Arch Icons (GitHub, Git, …) — https://jajera.github.io/arch-icons/ */
const ARCH_ICONS_BASE = "https://jajera.github.io/arch-icons";

const THEMES = {
  dark: {
    name: "dark",
    bgTop: "#2f2440",
    bgBottom: "#17111f",
    frameStroke: "#6d5f95",
    bandFill: "#3d3254",
    bandStroke: "#6d5f95",
    bandText: "#e8e0f4",
    title: "#f4f1f8",
    muted: "#9b92b0",
    arrow: "#6d5f95",
    panelFill: "#231a30",
    panelStroke: "#6d5f95",
    panelLabel: "#e8e0f4",
    pillFill: "#3d3254",
    githubTint: "#f4f1f8",
    kueuePath: "icons/kueue/kueue-icon-white.svg",
  },
  light: {
    name: "light",
    bgTop: "#f6f2fa",
    bgBottom: "#ebe4f4",
    frameStroke: "#b5a8cc",
    bandFill: "#e4dcf0",
    bandStroke: "#b5a8cc",
    bandText: "#3a314d",
    title: "#1f1829",
    muted: "#6b6280",
    arrow: "#8a7aa8",
    panelFill: "#ffffff",
    panelStroke: "#b5a8cc",
    panelLabel: "#3a314d",
    pillFill: "#e4dcf0",
    githubTint: "#1B1F23",
    kueuePath: "icons/kueue/kueue-icon-color.svg",
  },
};

mkdirSync(iconsDir, { recursive: true });

function stripSvg(svgText) {
  return svgText
    .replace(/<\?xml[^?]*\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/g, "")
    .trim();
}

/** Scope CSS classes + IDs so inlined icons don't collide (e.g. KEDA .cls-1 stroking Kueue junk paths). */
function scopeIconInner(inner, scopeId) {
  let out = inner;

  const ids = [...out.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const oldId of [...new Set(ids)]) {
    if (oldId.startsWith(`${scopeId}-`)) continue;
    const newId = `${scopeId}-${oldId}`;
    out = out.replaceAll(`id="${oldId}"`, `id="${newId}"`);
    out = out.replaceAll(`url(#${oldId})`, `url(#${newId})`);
    out = out.replaceAll(`href="#${oldId}"`, `href="#${newId}"`);
  }

  const classNames = new Set();
  for (const m of out.matchAll(/\.([A-Za-z_][\w-]*)\s*\{/g)) classNames.add(m[1]);
  for (const m of out.matchAll(/\bclass="([^"]+)"/g)) {
    for (const c of m[1].trim().split(/\s+/)) {
      if (c) classNames.add(c);
    }
  }

  for (const cls of classNames) {
    if (cls.startsWith(`${scopeId}-`)) continue;
    const scoped = `${scopeId}-${cls}`;
    out = out.replace(new RegExp(`\\.${cls}(?=[\\s{,])`, "g"), `.${scoped}`);
    out = out.replace(new RegExp(`(?<=\\bclass="[^"]*)\\b${cls}\\b`, "g"), scoped);
  }

  return out;
}

/** Drop Illustrator leftover paths that are fill:none with no stroke (edge "tabs"). */
function stripFillNoneJunk(inner) {
  const styleMatch = inner.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (!styleMatch) return inner;

  const noneClasses = new Set();
  const ruleRe = /\.([A-Za-z_][\w-]*)\s*\{([^}]*)\}/g;
  let rule;
  while ((rule = ruleRe.exec(styleMatch[1]))) {
    const body = rule[2].replace(/\s+/g, "");
    const hasStroke = /(?:^|;|)stroke:/.test(body) && !/stroke:\s*none/.test(rule[2]);
    const fillNone = /fill:\s*none/.test(rule[2]);
    if (fillNone && !hasStroke) noneClasses.add(rule[1]);
  }

  if (noneClasses.size === 0) return inner;

  let out = inner;
  for (const cls of noneClasses) {
    const tagRe = new RegExp(
      `<(?:path|polygon|polyline|circle|ellipse|rect)\\b[^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"[^>]*\\/?>`,
      "gi",
    );
    out = out.replace(tagRe, "");
  }
  return out;
}

function extractInnerSvg(svgText, scopeId) {
  const stripped = stripSvg(svgText);
  const match = stripped.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  if (!match) throw new Error("Invalid SVG content");
  let inner = match[1]
    .replace(/\bxlink:href=/g, "href=")
    .replace(/<(?:sodipodi|inkscape):[^>]*>/g, "")
    .replace(/<\/(?:sodipodi|inkscape):[^>]*>/g, "")
    .replace(/\s(?:sodipodi|inkscape):[a-zA-Z0-9_-]+="[^"]*"/g, "")
    .replace(/<(?:metadata|title|desc)[\s\S]*?<\/(?:metadata|title|desc)>/gi, "");

  inner = scopeIconInner(inner, scopeId);
  inner = stripFillNoneJunk(inner);
  return inner;
}

function getViewBox(svgText) {
  const stripped = stripSvg(svgText);
  const match = stripped.match(/viewBox="([^"]+)"/i);
  if (match) return match[1];
  const w = Number(stripped.match(/width="(\d+)/i)?.[1] ?? 64);
  const h = Number(stripped.match(/height="(\d+)/i)?.[1] ?? 64);
  return `0 0 ${w} ${h}`;
}

function parseViewBox(viewBox) {
  const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
  return { x, y, w, h };
}

const iconCache = new Map();

/** Prefer icons already in public/diagram-icons/ (user-curated), else fetch and cache. */
async function fetchIcon(id, path, { base = CNCF_ICONS_BASE, tint } = {}) {
  if (iconCache.has(id)) return iconCache.get(id);

  const localPath = join(iconsDir, `${id}.svg`);
  let svgText;
  if (existsSync(localPath)) {
    svgText = readFileSync(localPath, "utf8");
  } else {
    const url = `${base}/${path}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    svgText = await response.text();
    writeFileSync(localPath, svgText);
  }

  let inner = extractInnerSvg(svgText, id);
  if (tint) {
    inner = inner.replace(/\sfill="[^"]*"/g, "");
    inner = `<g fill="${tint}">${inner}</g>`;
  }

  const icon = {
    id,
    inner,
    viewBox: getViewBox(svgText),
  };
  iconCache.set(id, icon);
  return icon;
}

function makeThemeHelpers(theme) {
  function bgGradient(id) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop stop-color="${theme.bgTop}"/>
      <stop offset="1" stop-color="${theme.bgBottom}"/>
    </linearGradient>`;
  }

  function framedRect(width, height, rx = 12) {
    return `<rect width="${width}" height="${height}" rx="${rx}" fill="url(#bg)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${rx - 1}" stroke="${theme.frameStroke}" stroke-width="1" fill="none" opacity="0.55"/>`;
  }

  function wrapSvg(width, height, content) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" color-scheme="${theme.name}">
  <defs>${bgGradient("bg")}</defs>
  ${framedRect(width, height)}
  ${content}
</svg>`;
  }

  function layerBand(y, height, label) {
    return `<rect x="16" y="${y}" width="108" height="${height}" rx="8" fill="${theme.bandFill}" stroke="${theme.bandStroke}" stroke-width="1"/>
  <text x="70" y="${y + height / 2 + 5}" text-anchor="middle" fill="${theme.bandText}" font-family="sans-serif" font-size="13" font-weight="600">${label}</text>`;
  }

  function hArrow(x1, x2, y) {
    return `<line x1="${x1}" y1="${y}" x2="${x2 - 10}" y2="${y}" stroke="${theme.arrow}" stroke-width="2"/>
  <polygon points="${x2 - 10},${y - 5} ${x2},${y} ${x2 - 10},${y + 5}" fill="${theme.arrow}"/>`;
  }

  function vArrow(x, y1, y2) {
    return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 8}" stroke="${theme.arrow}" stroke-width="2"/>
  <polygon points="${x - 5},${y2 - 8} ${x},${y2} ${x + 5},${y2 - 8}" fill="${theme.arrow}"/>`;
  }

  function nodeLabels(cx, labelY, title, subtitle) {
    let out = `<text x="${cx}" y="${labelY}" text-anchor="middle" fill="${theme.title}" font-family="sans-serif" font-size="13" font-weight="600">${title}</text>`;
    if (subtitle) {
      out += `<text x="${cx}" y="${labelY + 16}" text-anchor="middle" fill="${theme.muted}" font-family="sans-serif" font-size="11">${subtitle}</text>`;
    }
    return out;
  }

  function iconAt(icon, cx, iconY, size) {
    const viewBox = parseViewBox(icon.viewBox);
    const scale = size / Math.max(viewBox.w, viewBox.h);
    const renderedW = viewBox.w * scale;
    const renderedH = viewBox.h * scale;
    const x = cx - renderedW / 2 - viewBox.x * scale;
    const y = iconY + (size - renderedH) / 2 - viewBox.y * scale;
    return `<g transform="translate(${x} ${y}) scale(${scale})">${icon.inner}</g>`;
  }

  function iconNode(icon, cx, iconY, labelY, title, subtitle, size = 56) {
    return `${iconAt(icon, cx, iconY, size)}
  ${nodeLabels(cx, labelY, title, subtitle)}`;
  }

  function buildIconRow(icons, startX, rowWidth, iconY, labelY) {
    const slotWidth = rowWidth / icons.length;
    const parts = [];

    for (let i = 0; i < icons.length; i += 1) {
      const entry = icons[i];
      const size = entry.size ?? 56;
      const cx = startX + slotWidth * i + slotWidth / 2;
      parts.push(iconNode(entry.icon, cx, iconY, labelY, entry.label, entry.sublabel, size));

      if (i < icons.length - 1) {
        const nextSize = icons[i + 1].size ?? 56;
        const nextCx = startX + slotWidth * (i + 1) + slotWidth / 2;
        const y = iconY + size / 2;
        parts.push(hArrow(cx + size / 2 + 8, nextCx - nextSize / 2 - 8, y));
      }
    }

    return parts.join("\n");
  }

  function mutedLabel(x, y, text) {
    return `<text x="${x}" y="${y}" fill="${theme.muted}" font-family="sans-serif" font-size="11">${text}</text>`;
  }

  return {
    wrapSvg,
    layerBand,
    hArrow,
    vArrow,
    iconAt,
    iconNode,
    nodeLabels,
    buildIconRow,
    mutedLabel,
    theme,
  };
}

async function buildLayersDiagram(theme) {
  const h = makeThemeHelpers(theme);
  const suffix = theme.name;

  const [github, argo, kueue, keda, job, node] = await Promise.all([
    fetchIcon(`github-${suffix}`, "icons/github/Octicons-mark-github.svg", {
      base: ARCH_ICONS_BASE,
      tint: theme.githubTint,
    }),
    fetchIcon("argo", "icons/argo/argo-icon-color.svg"),
    fetchIcon(`kueue-${suffix}`, theme.kueuePath),
    fetchIcon("keda", "icons/keda/keda-icon-color.svg"),
    fetchIcon("job", "icons/k8s-resources/job-labeled.svg"),
    fetchIcon("node", "icons/k8s-infrastructure/node-labeled.svg"),
  ]);

  const width = 980;
  const rowHeight = 138;
  const startX = 140;
  const rowWidth = width - startX - 24;

  const row1Y = 24;
  const row2Y = row1Y + rowHeight;
  const row3Y = row2Y + rowHeight;
  const row4Y = row3Y + rowHeight;

  const iconMidY = (y) => y + 8;
  const labelY = (y) => y + 78;

  const gitCx = startX + rowWidth / 2;
  const argoCx = startX + rowWidth / 2;

  const gitopsRow = h.iconNode(
    github,
    gitCx,
    iconMidY(row1Y),
    labelY(row1Y),
    "GitHub",
    "source of truth",
  );

  const deliveryRow = `
  ${h.vArrow(gitCx, labelY(row1Y) + 18, iconMidY(row2Y) - 8)}
  ${h.mutedLabel(gitCx + 44, labelY(row1Y) + 36, "manifests")}
  ${h.iconNode(argo, argoCx, iconMidY(row2Y), labelY(row2Y), "Argo CD", "EKS Capability")}
  `;

  const clusterBoxY = row3Y - 10;
  const clusterBoxH = rowHeight + 6;
  const clusterRow = h.buildIconRow(
    [
      { icon: kueue, label: "Kueue", sublabel: "admits batch Jobs", size: 56 },
      { icon: keda, label: "KEDA", sublabel: "optional scaling", size: 56 },
      { icon: job, label: "Jobs", sublabel: "workloads", size: 52 },
    ],
    startX,
    rowWidth,
    iconMidY(row3Y),
    labelY(row3Y),
  );

  const computeCx = startX + rowWidth / 2;
  const computeRow = h.iconNode(
    node,
    computeCx,
    iconMidY(row4Y),
    labelY(row4Y),
    "Auto Mode",
    "provisions and scales nodes",
  );

  const connectors = `
  ${h.vArrow(argoCx, labelY(row2Y) + 20, clusterBoxY - 4)}
  ${h.mutedLabel(argoCx + 44, labelY(row2Y) + 36, "sync")}
  ${h.vArrow(startX + rowWidth / 2, labelY(row3Y) + 24, iconMidY(row4Y) - 8)}
  `;

  const content = `
  ${h.layerBand(18, rowHeight - 12, "GitOps")}
  ${h.layerBand(18 + rowHeight, rowHeight - 12, "Delivery")}
  ${h.layerBand(18 + rowHeight * 2, rowHeight - 12, "Cluster")}
  ${h.layerBand(18 + rowHeight * 3, rowHeight - 12, "Compute")}
  ${gitopsRow}
  ${deliveryRow}
  <rect x="${startX - 8}" y="${clusterBoxY}" width="${rowWidth + 16}" height="${clusterBoxH}" rx="12" fill="${theme.panelFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${startX + 8}" y="${clusterBoxY + 18}" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12" font-weight="600">EKS cluster</text>
  ${clusterRow}
  ${connectors}
  ${computeRow}
  `;

  return h.wrapSvg(width, rowHeight * 4 + 24, content);
}

async function buildTopologyDiagram(theme) {
  const h = makeThemeHelpers(theme);
  const suffix = theme.name;

  const [argo, kueue, ns, node] = await Promise.all([
    fetchIcon("argo", "icons/argo/argo-icon-color.svg"),
    fetchIcon(`kueue-${suffix}`, theme.kueuePath),
    fetchIcon("ns", "icons/k8s-resources/ns-labeled.svg"),
    fetchIcon("node", "icons/k8s-infrastructure/node-labeled.svg"),
  ]);

  const width = 1040;
  const rowHeight = 148;
  const startX = 140;
  const rowWidth = width - startX - 24;

  const row1Y = 20;
  const row2Y = row1Y + rowHeight;
  const iconMidY = (y) => y + 10;
  const labelY = (y) => y + 82;

  const argoCx = startX + rowWidth / 2;
  const deliveryRow = h.iconNode(
    argo,
    argoCx,
    iconMidY(row1Y),
    labelY(row1Y),
    "Argo CD",
    "EKS Capability · AWS-managed GitOps",
  );

  const clusterBoxY = row2Y - 8;
  // Place below icon title + subtitle (labelY + 16), with clear gap.
  const quotaY = labelY(row2Y) + 28;
  const quotaH = 34;
  const clusterBoxH = quotaY + quotaH + 14 - clusterBoxY;
  // Leave room for a visible vertical connector into Compute.
  const arrowGap = 36;
  const row3Y = clusterBoxY + clusterBoxH + arrowGap;
  const clusterBandH = clusterBoxH + 8;
  const computeBandY = 12 + rowHeight + clusterBandH;
  const totalH = row3Y + rowHeight + 16;

  const clusterRow = h.buildIconRow(
    [
      { icon: kueue, label: "kueue-system", sublabel: "controller", size: 56 },
      { icon: ns, label: "project-a", sublabel: "LocalQueue + Jobs", size: 52 },
      { icon: ns, label: "project-b", sublabel: "LocalQueue + Jobs", size: 52 },
      { icon: ns, label: "project-c", sublabel: "LocalQueue + Jobs", size: 52 },
    ],
    startX,
    rowWidth,
    iconMidY(row2Y),
    labelY(row2Y),
  );

  const quotaBand = `<rect x="${startX + 48}" y="${quotaY}" width="${rowWidth - 96}" height="${quotaH}" rx="8" fill="${theme.pillFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${startX + rowWidth / 2}" y="${quotaY + 21}" text-anchor="middle" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12">ClusterQueue shared-batch · Spot + On-Demand quota</text>`;

  const computeCx = startX + rowWidth / 2;
  const computeRow = h.iconNode(
    node,
    computeCx,
    iconMidY(row3Y),
    labelY(row3Y),
    "Node pools",
    "system · general-purpose · batch (Spot)",
  );

  const content = `
  ${h.layerBand(12, rowHeight - 8, "GitOps")}
  ${h.layerBand(12 + rowHeight, clusterBandH, "Cluster")}
  ${h.layerBand(computeBandY, rowHeight - 8, "Compute")}
  ${deliveryRow}
  ${h.vArrow(argoCx, labelY(row1Y) + 18, clusterBoxY - 4)}
  ${h.mutedLabel(argoCx + 44, labelY(row1Y) + 36, "sync")}
  <rect x="${startX - 8}" y="${clusterBoxY}" width="${rowWidth + 16}" height="${clusterBoxH}" rx="12" fill="${theme.panelFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${startX + 8}" y="${clusterBoxY + 18}" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12" font-weight="600">EKS Auto Mode — kueue-lab</text>
  ${clusterRow}
  ${quotaBand}
  ${h.vArrow(startX + rowWidth / 2, clusterBoxY + clusterBoxH + 4, iconMidY(row3Y) - 8)}
  ${computeRow}
  `;

  return h.wrapSvg(width, totalH, content);
}

/** Queues page: Argo CD Application vs tenant namespaces / Jobs (not AppProjects). */
async function buildTenantsVsArgoDiagram(theme) {
  const h = makeThemeHelpers(theme);
  const suffix = theme.name;

  const [argo, kueue, ns, job] = await Promise.all([
    fetchIcon("argo", "icons/argo/argo-icon-color.svg"),
    fetchIcon(`kueue-${suffix}`, theme.kueuePath),
    fetchIcon("ns", "icons/k8s-resources/ns-labeled.svg"),
    fetchIcon("job", "icons/k8s-resources/job-labeled.svg"),
  ]);

  const width = 1040;
  const height = 420;
  const gap = 24;
  const leftX = 24;
  const leftW = 380;
  const rightX = leftX + leftW + gap;
  const rightW = width - rightX - 24;
  const panelY = 56;
  const panelH = height - panelY - 24;

  const leftCx = leftX + leftW / 2;
  const argoY = panelY + 28;
  const kueueY = panelY + 200;

  const tenantSlotW = rightW / 3;
  const tenantIconY = panelY + 36;
  const tenantNsLabelY = tenantIconY + 72;
  const jobY = tenantIconY + 108;
  const jobLabelY = jobY + 68;
  const queueY = panelY + panelH - 52;

  const tenants = ["project-a", "project-b", "project-c"];
  const tenantCols = tenants
    .map((name, i) => {
      const cx = rightX + tenantSlotW * i + tenantSlotW / 2;
      return `
  ${h.iconAt(ns, cx, tenantIconY, 48)}
  ${h.nodeLabels(cx, tenantNsLabelY, name, "Namespace + LocalQueue")}
  ${h.vArrow(cx, tenantNsLabelY + 22, jobY - 4)}
  ${h.iconAt(job, cx, jobY, 44)}
  ${h.nodeLabels(cx, jobLabelY, "sample-job", "kubectl Job")}`;
    })
    .join("\n");

  const content = `
  <text x="${width / 2}" y="34" text-anchor="middle" fill="${theme.title}" font-family="sans-serif" font-size="16" font-weight="600">Argo CD installs Kueue — tenants are namespaces, not AppProjects</text>

  <rect x="${leftX}" y="${panelY}" width="${leftW}" height="${panelH}" rx="12" fill="${theme.panelFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${leftX + 16}" y="${panelY + 22}" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12" font-weight="600">GitOps (one Application)</text>
  ${h.iconNode(argo, leftCx, argoY, argoY + 72, "Argo CD", "EKS Capability", 56)}
  ${h.vArrow(leftCx, argoY + 92, kueueY - 8)}
  ${h.mutedLabel(leftCx + 16, argoY + 108, "Application · kueue")}
  ${h.iconNode(kueue, leftCx, kueueY, kueueY + 72, "kueue-system", "controller only", 56)}
  <text x="${leftCx}" y="${panelY + panelH - 18}" text-anchor="middle" fill="${theme.muted}" font-family="sans-serif" font-size="11">No AppProject per tenant</text>

  <rect x="${rightX}" y="${panelY}" width="${rightW}" height="${panelH}" rx="12" fill="${theme.panelFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${rightX + 16}" y="${panelY + 22}" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12" font-weight="600">Batch tenants (Kubernetes namespaces)</text>
  ${tenantCols}
  <rect x="${rightX + 24}" y="${queueY}" width="${rightW - 48}" height="36" rx="8" fill="${theme.pillFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${rightX + rightW / 2}" y="${queueY + 23}" text-anchor="middle" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12">ClusterQueue shared-batch · fair share across tenants</text>
  `;

  return h.wrapSvg(width, height, content);
}

/** Queues page: default Auto Mode pools vs lab batch (Spot) NodePool. */
async function buildNodePoolsDiagram(theme) {
  const h = makeThemeHelpers(theme);

  const [node, job] = await Promise.all([
    fetchIcon("node", "icons/k8s-infrastructure/node-labeled.svg"),
    fetchIcon("job", "icons/k8s-resources/job-labeled.svg"),
  ]);

  const width = 1040;
  const height = 340;
  const startX = 24;
  const cardGap = 20;
  const cardW = (width - startX * 2 - cardGap * 2) / 3;
  const cardY = 56;
  const cardH = 220;

  const pools = [
    {
      name: "system",
      capacity: "on-demand",
      note: "Default Auto Mode",
      detail: "Platform / CriticalAddonsOnly",
      highlight: false,
    },
    {
      name: "general-purpose",
      capacity: "on-demand only",
      note: "Default Auto Mode",
      detail: "No Spot requirement",
      highlight: false,
    },
    {
      name: "batch",
      capacity: "spot + on-demand",
      note: "Lab NodePool (this page)",
      detail: "Satisfies Spot ResourceFlavor",
      highlight: true,
    },
  ];

  const cards = pools
    .map((pool, i) => {
      const x = startX + i * (cardW + cardGap);
      const cx = x + cardW / 2;
      const stroke = pool.highlight ? theme.title : theme.panelStroke;
      const strokeW = pool.highlight ? 2 : 1;
      const badge =
        pool.highlight
          ? `<rect x="${x + 16}" y="${cardY + cardH - 44}" width="${cardW - 32}" height="28" rx="8" fill="${theme.pillFill}" stroke="${stroke}" stroke-width="1"/>
  <text x="${cx}" y="${cardY + cardH - 25}" text-anchor="middle" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12" font-weight="600">${pool.capacity}</text>`
          : `<text x="${cx}" y="${cardY + cardH - 28}" text-anchor="middle" fill="${theme.muted}" font-family="sans-serif" font-size="12">${pool.capacity}</text>`;

      return `
  <rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="12" fill="${theme.panelFill}" stroke="${stroke}" stroke-width="${strokeW}"/>
  <text x="${x + 16}" y="${cardY + 24}" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12" font-weight="600">${pool.note}</text>
  ${h.iconAt(node, cx, cardY + 40, 56)}
  ${h.nodeLabels(cx, cardY + 118, pool.name, pool.detail)}
  ${badge}`;
    })
    .join("\n");

  const jobCx = startX + 2 * (cardW + cardGap) + cardW / 2;
  const content = `
  <text x="${width / 2}" y="34" text-anchor="middle" fill="${theme.title}" font-family="sans-serif" font-size="16" font-weight="600">Auto Mode NodePools — only batch can launch Spot for Kueue Jobs</text>
  ${cards}
  ${h.iconAt(job, jobCx - cardW / 2 + 36, cardY + cardH + 8, 28)}
  <text x="${jobCx - cardW / 2 + 58}" y="${cardY + cardH + 28}" fill="${theme.muted}" font-family="sans-serif" font-size="12">sample-job pods (Spot flavor) schedule on batch</text>
  `;

  return h.wrapSvg(width, height + 24, content);
}

/** Reference page: KEDA scales replicas from events; Kueue admits batch Jobs by quota. */
async function buildKedaVsKueueDiagram(theme) {
  const h = makeThemeHelpers(theme);
  const suffix = theme.name;

  const [keda, kueue, deploy, job, kafka, prometheus] = await Promise.all([
    fetchIcon("keda", "icons/keda/keda-icon-color.svg"),
    fetchIcon(`kueue-${suffix}`, theme.kueuePath),
    fetchIcon("deploy", "icons/k8s-resources/deploy-labeled.svg"),
    fetchIcon("job", "icons/k8s-resources/job-labeled.svg"),
    fetchIcon(`kafka-${suffix}`, "icons/kafka/Apache_Kafka_logo.svg", {
      base: ARCH_ICONS_BASE,
      tint: theme.githubTint,
    }),
    fetchIcon("prometheus", "icons/prometheus/prometheus-icon-color.svg"),
  ]);

  const width = 1040;
  const height = 480;
  const gap = 24;
  const leftX = 24;
  const leftW = (width - 48 - gap) / 2;
  const rightX = leftX + leftW + gap;
  const rightW = leftW;
  const panelY = 56;
  const panelH = height - panelY - 24;

  const leftCx = leftX + leftW / 2;
  const rightCx = rightX + rightW / 2;

  // KEDA column flow
  const triggerY = panelY + 36;
  const kedaY = panelY + 150;
  const deployY = panelY + 270;
  const triggerGap = leftW / 2;

  // Kueue column flow
  const jobsY = panelY + 36;
  const kueueY = panelY + 150;
  const outcomeY = panelY + 270;
  const outcomeGap = rightW / 2;

  const content = `
  <text x="${width / 2}" y="34" text-anchor="middle" fill="${theme.title}" font-family="sans-serif" font-size="16" font-weight="600">Same cluster, different questions</text>

  <rect x="${leftX}" y="${panelY}" width="${leftW}" height="${panelH}" rx="12" fill="${theme.panelFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${leftX + 16}" y="${panelY + 22}" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12" font-weight="600">KEDA — how many replicas?</text>
  ${h.iconAt(kafka, leftCx - triggerGap / 2 + 8, triggerY, 44)}
  ${h.nodeLabels(leftCx - triggerGap / 2 + 8, triggerY + 58, "Kafka / SQS", "external demand")}
  ${h.iconAt(prometheus, leftCx + triggerGap / 2 - 8, triggerY, 44)}
  ${h.nodeLabels(leftCx + triggerGap / 2 - 8, triggerY + 58, "Prometheus", "metrics / cron")}
  ${h.vArrow(leftCx, triggerY + 78, kedaY - 6)}
  ${h.mutedLabel(leftCx + 14, triggerY + 96, "ScaledObject")}
  ${h.iconNode(keda, leftCx, kedaY, kedaY + 68, "KEDA", "event-driven autoscaler", 52)}
  ${h.vArrow(leftCx, kedaY + 88, deployY - 6)}
  ${h.mutedLabel(leftCx + 14, kedaY + 106, "replicas ↑↓")}
  ${h.iconNode(deploy, leftCx, deployY, deployY + 68, "Deployment", "always-on workers / APIs", 48)}
  <text x="${leftCx}" y="${panelY + panelH - 20}" text-anchor="middle" fill="${theme.muted}" font-family="sans-serif" font-size="11">No batch quota — scale to demand</text>

  <rect x="${rightX}" y="${panelY}" width="${rightW}" height="${panelH}" rx="12" fill="${theme.panelFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${rightX + 16}" y="${panelY + 22}" fill="${theme.panelLabel}" font-family="sans-serif" font-size="12" font-weight="600">Kueue — which Jobs may run?</text>
  ${h.iconAt(job, rightCx - 70, jobsY, 40)}
  ${h.iconAt(job, rightCx - 20, jobsY + 8, 40)}
  ${h.iconAt(job, rightCx + 30, jobsY, 40)}
  <text x="${rightCx}" y="${jobsY + 68}" text-anchor="middle" fill="${theme.title}" font-family="sans-serif" font-size="13" font-weight="600">Many Jobs</text>
  <text x="${rightCx}" y="${jobsY + 84}" text-anchor="middle" fill="${theme.muted}" font-family="sans-serif" font-size="11">training · ETL · batch</text>
  ${h.vArrow(rightCx, jobsY + 94, kueueY - 6)}
  ${h.mutedLabel(rightCx + 14, jobsY + 112, "Workload")}
  ${h.iconNode(kueue, rightCx, kueueY, kueueY + 68, "Kueue", "admission + quota", 52)}
  ${h.vArrow(rightCx, kueueY + 88, outcomeY - 6)}
  ${h.mutedLabel(rightCx + 14, kueueY + 106, "quota gate")}
  <rect x="${rightX + 20}" y="${outcomeY}" width="${outcomeGap - 28}" height="64" rx="10" fill="${theme.pillFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${rightX + 20 + (outcomeGap - 28) / 2}" y="${outcomeY + 28}" text-anchor="middle" fill="${theme.title}" font-family="sans-serif" font-size="13" font-weight="600">Admitted</text>
  <text x="${rightX + 20 + (outcomeGap - 28) / 2}" y="${outcomeY + 46}" text-anchor="middle" fill="${theme.muted}" font-family="sans-serif" font-size="11">pods may start</text>
  <rect x="${rightX + outcomeGap + 8}" y="${outcomeY}" width="${outcomeGap - 28}" height="64" rx="10" fill="${theme.pillFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${rightX + outcomeGap + 8 + (outcomeGap - 28) / 2}" y="${outcomeY + 28}" text-anchor="middle" fill="${theme.title}" font-family="sans-serif" font-size="13" font-weight="600">Queued</text>
  <text x="${rightX + outcomeGap + 8 + (outcomeGap - 28) / 2}" y="${outcomeY + 46}" text-anchor="middle" fill="${theme.muted}" font-family="sans-serif" font-size="11">wait for quota</text>
  <text x="${rightCx}" y="${panelY + panelH - 20}" text-anchor="middle" fill="${theme.muted}" font-family="sans-serif" font-size="11">Cap concurrency — fair share across tenants</text>
  `;

  return h.wrapSvg(width, height, content);
}

/** Reference page: KEDA workers submit Jobs that Kueue admits. */
async function buildKedaKueueTogetherDiagram(theme) {
  const h = makeThemeHelpers(theme);
  const suffix = theme.name;

  const [keda, kueue, deploy, job, kafka, node] = await Promise.all([
    fetchIcon("keda", "icons/keda/keda-icon-color.svg"),
    fetchIcon(`kueue-${suffix}`, theme.kueuePath),
    fetchIcon("deploy", "icons/k8s-resources/deploy-labeled.svg"),
    fetchIcon("job", "icons/k8s-resources/job-labeled.svg"),
    fetchIcon(`kafka-${suffix}`, "icons/kafka/Apache_Kafka_logo.svg", {
      base: ARCH_ICONS_BASE,
      tint: theme.githubTint,
    }),
    fetchIcon("node", "icons/k8s-infrastructure/node-labeled.svg"),
  ]);

  const width = 1040;
  const height = 280;
  const startX = 40;
  const rowWidth = width - startX - 40;
  const iconY = 72;
  const labelY = 148;

  const steps = [
    { icon: kafka, label: "Events", sublabel: "SQS · Kafka · …", size: 48 },
    { icon: keda, label: "KEDA", sublabel: "scale workers", size: 52 },
    { icon: deploy, label: "Workers", sublabel: "Deployment", size: 48 },
    { icon: job, label: "Jobs", sublabel: "submit batch", size: 48 },
    { icon: kueue, label: "Kueue", sublabel: "admit by quota", size: 52 },
    { icon: node, label: "Nodes", sublabel: "Auto Mode", size: 48 },
  ];

  const row = h.buildIconRow(steps, startX, rowWidth, iconY, labelY);

  const content = `
  <text x="${width / 2}" y="34" text-anchor="middle" fill="${theme.title}" font-family="sans-serif" font-size="16" font-weight="600">Use together — KEDA reacts to demand; Kueue gates batch onto quota</text>
  ${row}
  <rect x="48" y="200" width="${width - 96}" height="48" rx="10" fill="${theme.pillFill}" stroke="${theme.panelStroke}" stroke-width="1"/>
  <text x="${width / 2}" y="230" text-anchor="middle" fill="${theme.panelLabel}" font-family="sans-serif" font-size="13">Workers can scale freely · Jobs still wait in line when ClusterQueue is full</text>
  `;

  return h.wrapSvg(width, height, content);
}

async function writeDiagramPair(baseName, build) {
  for (const theme of [THEMES.dark, THEMES.light]) {
    const svg = await build(theme);
    const suffix = theme.name === "dark" ? "" : "-light";
    const svgPath = join(publicDir, `${baseName}${suffix}.svg`);
    writeFileSync(svgPath, svg);
    console.log(`Wrote ${svgPath}`);
  }
}

await writeDiagramPair("layers-diagram", buildLayersDiagram);
await writeDiagramPair("architecture-diagram", buildTopologyDiagram);
await writeDiagramPair("tenants-vs-argo-diagram", buildTenantsVsArgoDiagram);
await writeDiagramPair("nodepools-diagram", buildNodePoolsDiagram);
await writeDiagramPair("keda-vs-kueue-diagram", buildKedaVsKueueDiagram);
await writeDiagramPair("keda-kueue-together-diagram", buildKedaKueueTogetherDiagram);
