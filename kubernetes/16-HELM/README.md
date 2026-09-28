# Helm

## What is Helm?

Helm is the package manager for Kubernetes. It lets you define, install, and upgrade
Kubernetes applications using a single unit called a **chart** — a collection of
pre-templated YAML manifests bundled together with default values and metadata.

Without Helm you apply every manifest file individually and track versions manually.
With Helm you install an entire application (Deployments, Services, ConfigMaps, RBAC,
etc.) with one command, pass in your own values to override defaults, and roll back
to any previous release in seconds.

### Core concepts

| Term | What it means |
|---|---|
| **Chart** | A packaged Kubernetes application (like an apt/yum package) |
| **Repository** | A remote index of charts (like apt sources or npm registry) |
| **Release** | A running instance of a chart installed into a cluster |
| **Values** | Key-value overrides you pass at install/upgrade time |
| **Revision** | A numbered snapshot of a release — every install or upgrade creates one |

---

## Why use Helm?

- **One command installs everything** — no need to `kubectl apply` 10 files in order
- **Versioned releases** — every change is tracked; roll back with one command
- **Reusable templates** — the same chart deploys to dev, staging, and prod with
  different values
- **Community charts** — thousands of production-ready charts for common tools
  (nginx, cert-manager, prometheus, external-secrets, etc.)
- **Upgrade in place** — `helm upgrade` diffs the current release and applies only
  what changed

---

## Install Helm locally

### Windows (Chocolatey) — recommended
```powershell
choco install kubernetes-helm
```

### Windows (Scoop)
```powershell
scoop install helm
```

### Windows (manual)
1. Download the latest release from https://github.com/helm/helm/releases
2. Extract the zip and move `helm.exe` to a folder on your `PATH`
   (e.g. `C:\Windows\System32`)

### macOS
```bash
brew install helm
```

### Linux
```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Verify the installation
```bash
helm version
# helm.sh/helm/v3.x.x
```

---

## Add a chart repository

A repository is a remote index of charts. You add it once and then search or pull
charts from it by name.

```bash
# Syntax
helm repo add <repo-name> <repo-url>

# Example — add the External Secrets Operator repo
helm repo add external-secrets https://charts.external-secrets.io

# Example — add the AWS Load Balancer Controller repo
helm repo add eks https://aws.github.io/eks-charts

# Example — add the ingress-nginx repo
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx

# Always update the local index after adding a repo
helm repo update
```

### List all added repositories
```bash
helm repo list
```

### Search for charts inside a repo
```bash
# Search by repo name
helm search repo external-secrets

# Search across all added repos
helm search repo nginx
```

---

## Pull (download) a chart locally

Pulling downloads the chart tarball to your machine so you can inspect it,
customise values, and install from the local copy — giving you full control
over what gets applied to the cluster.

```bash
# Syntax
helm pull <repo-name>/<chart-name> --untar --destination <folder>

# Example — pull the External Secrets Operator chart into a local folder
helm pull external-secrets/external-secrets \
  --untar \
  --destination ./helm-charts

# Example — pull a specific version
helm pull external-secrets/external-secrets \
  --version 0.9.11 \
  --untar \
  --destination ./helm-charts
```

After pulling, the folder structure looks like:

```
helm-charts/
└── external-secrets/
    ├── Chart.yaml          # chart metadata (name, version, description)
    ├── values.yaml         # all default values — edit this to customise
    ├── templates/          # the actual Kubernetes manifest templates
    └── charts/             # sub-charts (dependencies)
```

### Inspect default values before installing
```bash
# Print all configurable values for a chart
helm show values external-secrets/external-secrets

# Or read the pulled values file directly
cat ./helm-charts/external-secrets/values.yaml
```

---

## Install a chart

Once you have reviewed the chart you install it as a named **release** into your cluster.

```bash
# Syntax
helm install <release-name> <chart-source> \
  --namespace <namespace> \
  --create-namespace \
  --set key=value \
  --values custom-values.yaml

# Example — install from the remote repo
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace

# Example — install from the locally pulled chart folder
helm install external-secrets ./helm-charts/external-secrets \
  --namespace external-secrets \
  --create-namespace

# Example — install the AWS Load Balancer Controller with required values
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName=color-app-cluster-prod \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller
```

### Verify the release installed successfully
```bash
# List all releases in a namespace
helm list -n external-secrets

# Get the full status of a release
helm status external-secrets -n external-secrets

# Check the Kubernetes resources the release created
kubectl get all -n external-secrets
```

---

## Upgrade a release

When a new chart version is available, or you want to change values, use
`helm upgrade`. It creates a new revision and applies only the diff.

```bash
# Syntax
helm upgrade <release-name> <chart-source> \
  --namespace <namespace> \
  --set key=newValue \
  --values updated-values.yaml

# Example — upgrade External Secrets to a newer chart version
helm upgrade external-secrets external-secrets/external-secrets \
  --namespace external-secrets

# Example — upgrade and change a value at the same time
helm upgrade external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --set replicaCount=2

# install-or-upgrade in one command (safe for CI/CD pipelines)
helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace
```

### Check revision history after an upgrade
```bash
helm history external-secrets -n external-secrets
# REVISION  STATUS      CHART                        DESCRIPTION
# 1         superseded  external-secrets-0.9.10      Install complete
# 2         deployed    external-secrets-0.9.11      Upgrade complete
```

---

## Roll back a release

```bash
# Roll back to the previous revision
helm rollback external-secrets -n external-secrets

# Roll back to a specific revision number
helm rollback external-secrets 1 -n external-secrets
```

---

## Uninstall a release

```bash
helm uninstall external-secrets -n external-secrets
```

---

## Full workflow summary

```bash
# 1. Install Helm
choco install kubernetes-helm

# 2. Add the chart repository
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

# 3. Pull the chart locally to inspect it
helm pull external-secrets/external-secrets --untar --destination ./helm-charts

# 4. Review and customise values
cat ./helm-charts/external-secrets/values.yaml

# 5. Install the release
helm install external-secrets ./helm-charts/external-secrets \
  --namespace external-secrets \
  --create-namespace

# 6. Verify
helm list -n external-secrets
kubectl get all -n external-secrets

# 7. Upgrade when needed
helm upgrade external-secrets ./helm-charts/external-secrets \
  --namespace external-secrets

# 8. Check history
helm history external-secrets -n external-secrets

# 9. Roll back if something breaks
helm rollback external-secrets -n external-secrets
```
