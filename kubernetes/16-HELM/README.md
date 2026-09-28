# Helm

## What is Helm?

Helm is the package manager for Kubernetes. Instead of managing 10 separate
YAML files (Deployment, Service, ConfigMap, Secret, HPA, etc.) and applying
them one by one, Helm bundles them into a single unit called a **chart**.
A chart is a folder of templated Kubernetes manifests with a `values.yaml`
file that controls every configurable value — image tag, replicas, namespace,
resource limits — from one place.

### Core concepts

| Term | What it means |
|---|---|
| **Chart** | A packaged Kubernetes application — a folder of templates + values |
| **values.yaml** | The single file you edit to configure the chart for any environment |
| **Release** | A named, running instance of a chart installed into the cluster |
| **Revision** | A numbered snapshot — every install or upgrade creates a new one |
| **Repository** | A remote index of pre-built charts (like npm or apt) |

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

### macOS
```bash
brew install helm
```

### Linux
```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Verify
```bash
helm version
# helm.sh/helm/v3.x.x
```

---

## Create a chart for color-app

`helm create` scaffolds a complete chart folder structure locally with all the
files you need. You then go into each file and replace the generated defaults
with your actual app configuration.

```bash
# Navigate to the kubernetes folder in the repo
cd hilltop-color-app/kubernetes/16-HELM

# Create the chart — this generates the full folder structure instantly
helm create color-app
```

This produces the following structure:

```
color-app/
├── Chart.yaml              # chart metadata — name, version, description
├── values.yaml             # ALL configurable values live here — edit this first
├── charts/                 # sub-chart dependencies (leave empty for now)
├── .helmignore             # files to exclude from the packaged chart
└── templates/
    ├── deployment.yaml     # Deployment template
    ├── service.yaml        # Service template
    ├── serviceaccount.yaml # ServiceAccount template
    ├── hpa.yaml            # HorizontalPodAutoscaler template
    ├── ingress.yaml        # Ingress template
    ├── configmap.yaml      # not generated — you add this manually
    ├── secret.yaml         # not generated — you add this manually
    ├── _helpers.tpl        # reusable template helpers (name, labels, etc.)
    ├── NOTES.txt           # printed to the terminal after helm install
    └── tests/
        └── test-connection.yaml
```

---

## What to edit after running helm create

### 1. `Chart.yaml` — set the chart identity

```yaml
apiVersion: v2
name: color-app
description: Helm chart for the hilltop color-app
type: application
version: 0.1.0        # chart version — bump this on every change
appVersion: "v1"      # the image tag being deployed
```

### 2. `values.yaml` — the only file you change per environment

Replace the generated defaults with color-app values:

```yaml
replicaCount: 3

image:
  repository: 075120018043.dkr.ecr.us-east-1.amazonaws.com/color-app
  pullPolicy: IfNotPresent
  tag: "v1"

namespace: color-app

serviceAccount:
  create: true
  name: color-app-sa

service:
  type: LoadBalancer
  port: 80
  targetPort: 8080
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "external"
    service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: "ip"
    service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"

resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "250m"
    memory: "256Mi"

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 60

configmap:
  APP_COLOR: "blue"
  APP_ENV: "production"
  APP_MESSAGE: "Hello from Helm!"

secret:
  SECRET_KEY: "bXktc2VjcmV0LWtleQ=="   # base64 encoded
```

### 3. `templates/deployment.yaml` — wire up the configmap and secret

The generated deployment does not know about your ConfigMap or Secret.
Open the file and add `envFrom` and `env` under the container spec:

```yaml
envFrom:
  - configMapRef:
      name: {{ include "color-app.fullname" . }}-config
env:
  - name: SECRET_KEY
    valueFrom:
      secretKeyRef:
        name: {{ include "color-app.fullname" . }}-secret
        key: SECRET_KEY
```

### 4. `templates/configmap.yaml` — create this file manually

`helm create` does not generate a ConfigMap. Create it yourself:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "color-app.fullname" . }}-config
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "color-app.labels" . | nindent 4 }}
data:
  APP_COLOR: {{ .Values.configmap.APP_COLOR | quote }}
  APP_ENV: {{ .Values.configmap.APP_ENV | quote }}
  APP_MESSAGE: {{ .Values.configmap.APP_MESSAGE | quote }}
```

### 5. `templates/secret.yaml` — create this file manually

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "color-app.fullname" . }}-secret
  namespace: {{ .Values.namespace }}
  labels:
    {{- include "color-app.labels" . | nindent 4 }}
type: Opaque
data:
  SECRET_KEY: {{ .Values.secret.SECRET_KEY }}
```

---

## Validate the chart before installing

```bash
# Check the chart for syntax errors
helm lint color-app/

# Render all templates locally without touching the cluster
# This lets you see the exact YAML that will be applied
helm template color-app color-app/ --values color-app/values.yaml

# Dry-run against the cluster — catches API validation errors too
helm install color-app color-app/ \
  --namespace color-app \
  --create-namespace \
  --dry-run
```

---

## Install the chart

Once you have edited the files and validated them:

```bash
helm install color-app color-app/ \
  --namespace color-app \
  --create-namespace
```

Verify the release:

```bash
# List all Helm releases
helm list -n color-app

# Check the status of this release
helm status color-app -n color-app

# Check the resources it created
kubectl get all -n color-app
```

---

## Override values per environment without editing values.yaml

Create a separate values file for each environment and pass it at install time:

```bash
# values-prod.yaml
image:
  tag: "v2"
replicaCount: 5
configmap:
  APP_ENV: "production"
  APP_COLOR: "green"
```

```bash
helm install color-app color-app/ \
  --namespace color-app \
  --create-namespace \
  --values color-app/values-prod.yaml
```

---

## Upgrade the release

When you change `values.yaml` or bump the image tag:

```bash
# Edit values.yaml — e.g. change image.tag from v1 to v2
# Then upgrade
helm upgrade color-app color-app/ \
  --namespace color-app

# Or pass the new value inline without editing the file
helm upgrade color-app color-app/ \
  --namespace color-app \
  --set image.tag=v2

# Check the new revision was created
helm history color-app -n color-app
# REVISION  STATUS      CHART            DESCRIPTION
# 1         superseded  color-app-0.1.0  Install complete
# 2         deployed    color-app-0.1.0  Upgrade complete
```

---

## Roll back

```bash
# Roll back to the previous revision
helm rollback color-app -n color-app

# Roll back to a specific revision
helm rollback color-app 1 -n color-app
```

---

## Uninstall

```bash
helm uninstall color-app -n color-app
```

---

## Full workflow summary

```bash
# 1. Install Helm
choco install kubernetes-helm

# 2. Scaffold the chart
cd hilltop-color-app/kubernetes/16-HELM
helm create color-app

# 3. Edit the generated files
#    - Chart.yaml        → set name, version, appVersion
#    - values.yaml       → set image, replicas, service, configmap, secret values
#    - templates/        → wire up configmap + secret in deployment.yaml
#    - templates/        → create configmap.yaml and secret.yaml manually

# 4. Validate
helm lint color-app/
helm template color-app color-app/ --values color-app/values.yaml
helm install color-app color-app/ --namespace color-app --create-namespace --dry-run

# 5. Install
helm install color-app color-app/ --namespace color-app --create-namespace

# 6. Verify
helm list -n color-app
kubectl get all -n color-app

# 7. Upgrade (after changing values or image tag)
helm upgrade color-app color-app/ --namespace color-app

# 8. Check history
helm history color-app -n color-app

# 9. Roll back if needed
helm rollback color-app -n color-app
```
