# ArgoCD

## What is ArgoCD?

ArgoCD is a declarative, GitOps-based continuous delivery tool for Kubernetes.
It watches a Git repository and automatically reconciles the live cluster state
with the desired state defined in that repo. If someone manually changes a
resource in the cluster, ArgoCD detects the drift and can automatically or
manually revert it back to what Git says it should be.

The core principle is: **Git is the single source of truth**. Every deployment,
rollback, and config change is a Git commit — giving you a full audit trail,
peer review via pull requests, and instant rollback by reverting a commit.

### How ArgoCD fits into a GitOps pipeline

```
Developer pushes code
        │
        ▼
GitHub Actions / CI builds image → pushes to ECR
        │
        ▼
CI updates image tag in kubernetes/ manifests → commits to Git
        │
        ▼
ArgoCD detects the change in Git
        │
        ▼
ArgoCD syncs the change to the EKS cluster
        │
        ▼
New pods roll out — zero manual kubectl apply
```

### Core concepts

| Term | What it means |
|---|---|
| **Application** | An ArgoCD object that links a Git repo path to a cluster namespace |
| **Sync** | The act of applying Git state to the cluster |
| **Drift** | When live cluster state differs from Git state |
| **Self-heal** | ArgoCD automatically corrects drift without human intervention |
| **App of Apps** | A parent Application that manages child Applications — used for multi-service deployments |
| **Project** | A logical grouping of Applications with RBAC and source restrictions |

---

## Why ArgoCD over plain CI/CD?

| Plain CI/CD (`kubectl apply` in pipeline) | ArgoCD (GitOps) |
|---|---|
| Pipeline needs cluster credentials | ArgoCD runs inside the cluster — no outbound credentials |
| No visibility into live vs desired state | UI shows exact diff between Git and cluster |
| Rollback = re-run old pipeline | Rollback = `git revert` or one click in UI |
| Drift goes undetected | Drift is detected and alerted immediately |
| Each team member applies manually | Git PR is the only way to change production |

---

## Prerequisites

- EKS cluster running (`color-app-cluster-prod`)
- `kubectl` configured and pointing at the cluster
- Helm installed (see `16-HELM/README.md`)
- AWS CLI configured

Confirm your context before starting:

```bash
kubectl config current-context
# Should show: color-app-cluster-prod
```

---

## Step 1 — Install ArgoCD

### Option A: kubectl (official manifests)

```bash
# Create the dedicated namespace
kubectl create namespace argocd

# Install ArgoCD using the official stable manifest
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for all pods to be Running
kubectl wait --for=condition=Ready pod \
  -l app.kubernetes.io/name=argocd-server \
  -n argocd \
  --timeout=120s

# Verify all components are up
kubectl get pods -n argocd
# NAME                                                READY   STATUS    RESTARTS
# argocd-application-controller-0                    1/1     Running   0
# argocd-applicationset-controller-xxx               1/1     Running   0
# argocd-dex-server-xxx                              1/1     Running   0
# argocd-notifications-controller-xxx                1/1     Running   0
# argocd-redis-xxx                                   1/1     Running   0
# argocd-repo-server-xxx                             1/1     Running   0
# argocd-server-xxx                                  1/1     Running   0
```

### Option B: Helm (recommended for production — gives you version control)

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# Pull the chart locally to inspect values
helm pull argo/argo-cd --untar --destination ./helm-charts

# Install
helm install argocd argo/argo-cd \
  --namespace argocd \
  --create-namespace \
  --set server.service.type=ClusterIP \
  --set configs.params."server\.insecure"=true

# Verify
helm list -n argocd
kubectl get pods -n argocd
```

---

## Step 2 — Install the ArgoCD CLI

The CLI lets you manage ArgoCD from the terminal without opening the UI.

### Windows (Chocolatey)
```powershell
choco install argocd-cli
```

### Windows (manual)
```powershell
# Download the binary
Invoke-WebRequest -Uri https://github.com/argoproj/argo-cd/releases/latest/download/argocd-windows-amd64.exe -OutFile argocd.exe

# Move to a folder on your PATH
Move-Item argocd.exe C:\Windows\System32\argocd.exe
```

### macOS
```bash
brew install argocd
```

### Linux
```bash
curl -sSL -o argocd \
  https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd
sudo mv argocd /usr/local/bin/
```

### Verify
```bash
argocd version --client
```

---

## Step 3 — Access the ArgoCD UI

The ArgoCD server is not exposed externally by default. Use port-forward to
access it locally during setup.

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Open your browser at: **https://localhost:8080**

Accept the self-signed certificate warning.

### Get the initial admin password

```bash
# The initial password is auto-generated and stored in a secret
kubectl get secret argocd-initial-admin-secret \
  -n argocd \
  -o jsonpath="{.data.password}" | base64 --decode
echo
```

Login credentials:
- **Username**: `admin`
- **Password**: output of the command above

### Login via CLI

```bash
argocd login localhost:8080 \
  --username admin \
  --password <paste-password-here> \
  --insecure
```

### Change the admin password immediately (security best practice)

```bash
argocd account update-password \
  --current-password <initial-password> \
  --new-password <your-strong-password>
```

### Delete the initial secret after changing the password

```bash
kubectl delete secret argocd-initial-admin-secret -n argocd
```

---

## Step 4 — Expose ArgoCD via LoadBalancer (optional, for persistent access)

For a long-lived cluster, patch the service to use an AWS NLB instead of
port-forwarding every time.

```bash
kubectl patch svc argocd-server -n argocd \
  -p '{"spec": {"type": "LoadBalancer"}}'

# Get the external DNS
kubectl get svc argocd-server -n argocd
# NAME            TYPE           CLUSTER-IP    EXTERNAL-IP
# argocd-server   LoadBalancer   10.100.x.x    <nlb-dns>.elb.amazonaws.com

# Login using the NLB DNS
argocd login <nlb-dns>.elb.amazonaws.com \
  --username admin \
  --password <your-password> \
  --insecure
```

---

## Step 5 — Connect your Git repository

ArgoCD needs read access to the GitHub repo that holds your Kubernetes manifests.

### Public repo (no credentials needed)

```bash
argocd repo add https://github.com/CHAFAH/hilltop-color-app.git
```

### Private repo (HTTPS with token)

```bash
argocd repo add https://github.com/CHAFAH/hilltop-color-app.git \
  --username <github-username> \
  --password <github-personal-access-token>
```

### Private repo (SSH)

```bash
argocd repo add git@github.com:CHAFAH/hilltop-color-app.git \
  --ssh-private-key-path ~/.ssh/id_rsa
```

### Verify the repo is connected

```bash
argocd repo list
# TYPE  NAME  REPO                                              STATUS
# git         https://github.com/CHAFAH/hilltop-color-app.git  Successful
```

---

## Step 6 — Deploy color-app with ArgoCD

An ArgoCD **Application** is a Kubernetes custom resource that tells ArgoCD:
- which Git repo and path to watch
- which cluster and namespace to deploy into
- how to sync (manual or automatic)

### Option A: Apply the Application manifest (recommended — GitOps for ArgoCD itself)

Create the file `kubernetes/17-ARGOCD/color-app-application.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: color-app
  namespace: argocd
  # Finalizer ensures ArgoCD cleans up all resources when the Application is deleted
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default

  source:
    repoURL: https://github.com/CHAFAH/hilltop-color-app.git
    targetRevision: main
    # Path inside the repo that contains the manifests to deploy
    path: kubernetes/06-DEPLOYMENT

  destination:
    server: https://kubernetes.default.svc   # in-cluster
    namespace: color-app

  syncPolicy:
    automated:
      prune: true        # delete resources removed from Git
      selfHeal: true     # revert manual changes made directly in the cluster
    syncOptions:
      - CreateNamespace=true          # create color-app namespace if missing
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

Apply it:

```bash
kubectl apply -f kubernetes/17-ARGOCD/color-app-application.yaml
```

### Option B: Create via CLI

```bash
argocd app create color-app \
  --repo https://github.com/CHAFAH/hilltop-color-app.git \
  --path kubernetes/06-DEPLOYMENT \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace color-app \
  --revision main \
  --sync-policy automated \
  --auto-prune \
  --self-heal \
  --sync-option CreateNamespace=true
```

### Option C: Create via the UI

1. Open https://localhost:8080
2. Click **+ New App**
3. Fill in:
   - Application Name: `color-app`
   - Project: `default`
   - Sync Policy: `Automatic`
   - Check **Prune Resources** and **Self Heal**
   - Repository URL: `https://github.com/CHAFAH/hilltop-color-app.git`
   - Revision: `main`
   - Path: `kubernetes/06-DEPLOYMENT`
   - Cluster URL: `https://kubernetes.default.svc`
   - Namespace: `color-app`
4. Click **Create**

---

## Step 7 — Verify the deployment

```bash
# Check the Application status
argocd app get color-app

# Watch sync status in real time
argocd app wait color-app --sync

# Check the resources ArgoCD deployed
kubectl get all -n color-app

# Check the deployment rollout
kubectl rollout status deployment/color-app-deployment -n color-app

# Get the LoadBalancer URL
kubectl get svc -n color-app
```

In the UI the Application card should show:
- **Health**: Healthy (green)
- **Sync**: Synced (green)

---

## Step 8 — Deploy a new version (the GitOps way)

In a GitOps workflow you never run `kubectl set image` manually.
You update the manifest in Git and ArgoCD picks it up.

```bash
# 1. Update the image tag in deploy.yaml
#    Change: image: chafah/color-app:latest
#    To:     image: 075120018043.dkr.ecr.us-east-1.amazonaws.com/color-app:v2

# 2. Commit and push
git add kubernetes/06-DEPLOYMENT/deploy.yaml
git commit -m "Deploy color-app:v2 to production"
git push origin main

# 3. ArgoCD detects the change within 3 minutes (default poll interval)
#    or trigger an immediate sync:
argocd app sync color-app

# 4. Watch the rollout
argocd app wait color-app --health
kubectl rollout status deployment/color-app-deployment -n color-app
```

---

## Step 9 — Upgrade ArgoCD itself

```bash
# If installed via Helm
helm repo update
helm upgrade argocd argo/argo-cd \
  --namespace argocd \
  --reuse-values

# If installed via kubectl manifests
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

---

## Step 10 — Roll back a deployment

### Via ArgoCD (recommended)

```bash
# List revision history
argocd app history color-app
# ID  DATE                           REVISION
# 1   2026-09-28 10:00:00 +0000 UTC  main (abc1234)
# 2   2026-09-28 11:00:00 +0000 UTC  main (def5678)

# Roll back to revision 1
argocd app rollback color-app 1
```

### Via Git (the GitOps way — preferred in production)

```bash
# Revert the bad commit
git revert HEAD
git push origin main
# ArgoCD syncs the revert automatically
```

---

## Useful ArgoCD CLI commands

```bash
# List all applications
argocd app list

# Get detailed status of an app
argocd app get color-app

# Manually trigger a sync
argocd app sync color-app

# Sync and wait for completion
argocd app sync color-app --wait

# Diff Git state vs live cluster state
argocd app diff color-app

# View application logs
argocd app logs color-app

# Delete an application (and all its resources if finalizer is set)
argocd app delete color-app

# List connected clusters
argocd cluster list

# List connected repos
argocd repo list
```

---

## Production hardening checklist

- [ ] Change the default admin password and delete `argocd-initial-admin-secret`
- [ ] Create named user accounts — disable the `admin` account for day-to-day use
- [ ] Create ArgoCD **Projects** to restrict which repos and namespaces each team can deploy to
- [ ] Enable SSO (GitHub OAuth, Okta, etc.) via `argocd-cm` ConfigMap
- [ ] Use **App of Apps** pattern to manage all Applications from a single root Application
- [ ] Set resource limits on ArgoCD components in `values.yaml`
- [ ] Enable notifications (Slack, PagerDuty) via the ArgoCD Notifications controller
- [ ] Store the ArgoCD Application manifests in Git — ArgoCD manages itself
- [ ] Use `targetRevision: <tag>` instead of `main` in production to pin to a known-good commit
- [ ] Enable audit logging via the ArgoCD API server flags

---

## Full setup summary

```bash
# 1. Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=Ready pod \
  -l app.kubernetes.io/name=argocd-server -n argocd --timeout=120s

# 2. Get initial password
kubectl get secret argocd-initial-admin-secret \
  -n argocd -o jsonpath="{.data.password}" | base64 --decode && echo

# 3. Port-forward and login
kubectl port-forward svc/argocd-server -n argocd 8080:443 &
argocd login localhost:8080 --username admin --password <password> --insecure

# 4. Change password and clean up
argocd account update-password
kubectl delete secret argocd-initial-admin-secret -n argocd

# 5. Connect the repo
argocd repo add https://github.com/CHAFAH/hilltop-color-app.git

# 6. Deploy color-app
kubectl apply -f kubernetes/17-ARGOCD/color-app-application.yaml

# 7. Watch it sync
argocd app wait color-app --sync
kubectl get all -n color-app

# 8. Deploy new version — update image tag in Git, then:
argocd app sync color-app

# 9. Roll back if needed
argocd app rollback color-app 1
```
