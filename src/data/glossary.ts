export type GlossaryEntry =
  | string
  | {
      definition: string;
      url?: string;
      urlLabel?: string;
    };

export const glossary: Record<string, GlossaryEntry> = {
  kueue: {
    definition:
      "Kubernetes-native job admission controller — decides when batch Jobs may create pods based on quota, priority, and resource flavors.",
    url: "https://kueue.sigs.k8s.io/",
    urlLabel: "Kueue docs",
  },
  keda: {
    definition:
      "Kubernetes Event-driven Autoscaling — scales Deployment or StatefulSet replicas from external metrics such as SQS queue depth. Complements Kueue; does not replace batch admission.",
    url: "https://keda.sh/",
    urlLabel: "KEDA docs",
  },
  "auto-mode":
    "Amazon EKS Auto Mode — AWS-managed compute that provisions and scales node pools for schedulable pods without managed node groups.",
  eks: {
    definition:
      "Amazon Elastic Kubernetes Service — managed Kubernetes control plane; this lab uses cluster name `kueue-lab`.",
    url: "https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html",
    urlLabel: "EKS docs",
  },
  argocd: {
    definition:
      "Argo CD — GitOps controller that syncs cluster state from Git. This walkthrough uses the optional EKS managed Argo CD capability.",
    url: "https://argo-cd.readthedocs.io/",
    urlLabel: "Argo CD docs",
  },
  "identity-center":
    "AWS IAM Identity Center (formerly AWS SSO) — organization-wide workforce identity. CLI access uses `aws sso login`. For the EKS managed Argo CD capability it is the only supported UI auth (local Argo CD users are not supported).",
  idc:
    "Short for IAM Identity Center — see Identity Center. Lab vars like `IDC_REGION`, `IDC_INSTANCE_ARN`, and `IDC_USER_ID` wire SSO for managed Argo CD (the only supported auth for that capability).",
  "argocd-capability":
    "EKS Capability for Argo CD — AWS-managed Argo CD control plane that syncs Applications to your cluster without self-hosting on worker nodes.",
  gitops:
    "Declarative delivery from Git — manifests and Helm charts live in a repository; Argo CD applies changes on sync.",
  clusterqueue:
    "Kueue cluster-scoped queue — defines shared quota (CPU, memory) and which ResourceFlavors a tenant pool may use.",
  localqueue:
    "Kueue namespace-scoped queue — maps a namespace to a ClusterQueue so Jobs in that namespace enter the right admission pool.",
  resourceflavor:
    "Kueue scheduling hint — ties admitted workloads to node labels such as `karpenter.sh/capacity-type: spot` or `on-demand` (EKS Auto Mode).",
  workload:
    "Kueue CRD representing one batch Job under admission — status moves from Queued to Admitted when quota allows pod creation.",
  eksctl:
    "CLI for creating and managing EKS clusters — used here for Auto Mode cluster creation and optional Argo CD capability provisioning.",
  spot:
    "Amazon EC2 Spot capacity — lower-cost interruptible compute; this lab uses a Spot ResourceFlavor separate from On-Demand.",
  "on-demand":
    "Standard EC2 On-Demand capacity — non-interruptible nodes; second ResourceFlavor in the lab quota model.",
  admission:
    "Kueue admission gate — the decision whether a Job may create pods now, distinct from Kubernetes scheduling onto nodes.",
  hpa:
    "Horizontal Pod Autoscaler — scales replica count for Deployments from CPU or memory; used for serving workloads, not batch admission.",
  helm:
    "Package manager for Kubernetes — the Kueue controller installs from the upstream Helm chart via an Argo CD Application.",
  application:
    "Argo CD Application — GitOps resource pointing at a Helm chart or manifest path to sync into the cluster.",
  "node-pool":
    "EKS Auto Mode pool of homogenous nodes — this lab uses default system and general-purpose pools.",
  "walkthrough-repo":
    "jajera/kueue-eks-walkthrough — documentation site and example manifests for the Kueue on EKS lab.",
  queued:
    "Kueue Workload status — Job is waiting for quota; pods are not created yet.",
  admitted:
    "Kueue Workload status — Job passed admission; pods may be created and scheduled, subject to node capacity.",
  pending:
    "Pod phase — scheduler or kubelet has not placed or started the pod yet; distinct from Kueue Queued.",
};

export function resolveGlossaryEntry(entry: GlossaryEntry | undefined) {
  if (!entry) return { definition: undefined, url: undefined, urlLabel: undefined };
  if (typeof entry === "string") {
    return { definition: entry, url: undefined, urlLabel: undefined };
  }
  return {
    definition: entry.definition,
    url: entry.url,
    urlLabel: entry.urlLabel ?? entry.url,
  };
}
