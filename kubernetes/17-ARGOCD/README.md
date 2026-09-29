# ArgoCD

## What is ArgoCD?

ArgoCD is a declarative, GitOps-based continuous delivery tool for Kubernetes.
It watches a Git repository and automatically reconciles the live cluster state
with the desired state defined in that repo. If someone manually changes a
resource in the cluster, ArgoCD detects the drift and can automatically revert
it back to what Git says it should be.

The core principle is: **Git is the single source of truth**. Every deployment,
rollback, and config change is a Git commit — giving you a full audit trail,
peer review via pull requests, and instant rollback by reverting a commit.

### How ArgoCD fits into the pipeline

```
Developer pushes code
        │
        ▼
CI builds image → pushes to ECR
        │
        ▼
CI updates image.tag in helm/color-app/env/values-prod.yaml → commits to Git
        │
        ▼
ArgoCD detects the change in Git
        │
        ▼
ArgoCD runs helm template with the env values file → applies diff to EKS
        │
        ▼
New pods roll out automatically — zero manual kubectl apply
```

### Core concepts

| Term | What it means |
|---|---|
| **Application** | An ArgoCD object that links a Git repo path to a cluster namespace |
| **Sync** | The act of applying Git state to the cluster |
| **Drift** | When live cluster state differs from Git state |
| **Self-heal** | ArgoCD automatically corrects drift without human intervention |
| **App of Apps** | A parent Application that manages child Applications |
| **Project** | A logical grouping of Applications with RBAC and source restrictions |

---

## Prerequisites

- EKS cluster running (`color-app-cluster-prod`)
- `kubectl` configured and pointing at the cluster
- Helm installed (see `16-HELM/README.md`)
- AWS CLI configured

```bash
kubectl config current-context
# Should show: color-app-cluster-prod
```

---

## Step 1 — Install ArgoCD

```bash
kubectl create namespace argocd

kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

kubectl wait --for=condition=Ready pod \
  -l app.kubernetes.io/name=argocd-server \
  -n argocd \
  --timeout=120s

kubectl get pods -n argocd
```

---

## Step 2 — Install the ArgoCD CLI

### Windows (Chocolatey)
```powershell
choco install argocd-cli
```

### macOS
```bash
brew install argocd
```

### Linux
```bash
curl -sSL -o argocd \
  https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd && sudo mv argocd /usr/local/bin/
```

---

## Step 3 — Access the ArgoCD UI

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Open: **https://localhost:8080**

### Get the initial admin password

```bash
kubectl get secret argocd-initial-admin-secret \
  -n argocd \
  -o jsonpath="{.data.password}" | base64 --decode
echo
```

### Login via CLI

```bash
argocd login localhost:8080 \
  --username admin \
  --password <paste-password-here> \
  --insecure
```

### Change the admin password and delete the initial secret

```bash
argocd account update-password \
  --current-password <initial-password> \
  --new-password <your-strong-password>

kubectl delete secret argocd-initial-admin-secret -n argocd
```

---

## Step 4 — Expose ArgoCD via LoadBalancer (optional)

```bash
kubectl patch svc argocd-server -n argocd \
  -p '{"spec": {"type": "LoadBalancer"}}'

kubectl get svc argocd-server -n argocd
```

---

## Step 5 — Connect the Git repository

```bash
# Public repo
argocd repo add https://github.com/CHAFAH/hilltop-color-app.git

# Private repo (HTTPS token)
argocd repo add https://github.com/CHAFAH/hilltop-color-app.git \
  --username <github-username> \
  --password <github-personal-access-token>

# Verify
argocd repo list
```

---

## Step 6 — Deploy color-app with ArgoCD

The chart lives at `helm/color-app/` with environment-specific values files
under `helm/color-app/env/`. The ArgoCD Application manifest is at
`kubernetes/17-ARGOCD/color-app-application.yaml`.

### Application manifest

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: color-app
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default

  source:
    repoURL: https://github.com/CHAFAH/hilltop-color-app.git
    targetRevision: main
    path: helm/color-app
    helm:
      valueFiles:
        - env/values-prod.yaml

  destination:
    server: https://kubernetes.default.svc
    namespace: production

  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

### Apply the manifest

```bash
kubectl apply -f kubernetes/17-ARGOCD/color-app-application.yaml
```

### Or create via CLI

```bash
argocd app create color-app \
  --repo https://github.com/CHAFAH/hilltop-color-app.git \
  --path helm/color-app \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace production \
  --revision main \
  --helm-set-file values=helm/color-app/env/values-prod.yaml \
  --sync-policy automated \
  --auto-prune \
  --self-heal \
  --sync-option CreateNamespace=true
```

---

## Step 7 — Verify the deployment

```bash
argocd app get color-app
argocd app wait color-app --sync

kubectl get all -n production
kubectl get externalsecret -n production
kubectl get secret color-app-secret -n production
kubectl rollout status deployment/color-app-deployment -n production
```

---

## Step 8 — Deploy a new version (the GitOps way)

Never run `kubectl set image` manually. Update the values file in Git:

```bash
# 1. Edit the image tag in the env values file
#    helm/color-app/env/values-prod.yaml
#    Change: tag: "v1"
#    To:     tag: "v2"

# 2. Commit and push
git add helm/color-app/env/values-prod.yaml
git commit -m "deploy color-app:v2 to production"
git push origin main

# 3. ArgoCD detects the change within 3 minutes or trigger immediately
argocd app sync color-app

# 4. Watch the rollout
argocd app wait color-app --health
kubectl rollout status deployment/color-app-deployment -n production
```

> Any change to configmap, externalsecret, secretstore, pvc, or serviceaccount
> also triggers an automatic rolling restart via checksum annotations in the
> deployment pod template.

---

## Step 9 — Roll back a deployment

### Via ArgoCD CLI

```bash
argocd app history color-app
argocd app rollback color-app 1
```

### Via Git (preferred in production)

```bash
git revert HEAD
git push origin main
# ArgoCD syncs the revert automatically
```

---

## Step 10 — Upgrade ArgoCD itself

```bash
# Via kubectl manifests
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

---

## Useful ArgoCD CLI commands

```bash
argocd app list
argocd app get color-app
argocd app sync color-app
argocd app sync color-app --wait
argocd app diff color-app
argocd app logs color-app
argocd app history color-app
argocd app rollback color-app 1
argocd app delete color-app
```

---

## Production hardening checklist

- [ ] Change the default admin password and delete `argocd-initial-admin-secret`
- [ ] Create named user accounts — disable the `admin` account for day-to-day use
- [ ] Create ArgoCD **Projects** to restrict which repos and namespaces each team can deploy to
- [ ] Enable SSO (GitHub OAuth, Okta, etc.) via `argocd-cm` ConfigMap
- [ ] Use **App of Apps** pattern to manage all Applications from a single root Application
- [ ] Use `targetRevision: <tag>` instead of `main` in production to pin to a known-good commit
- [ ] Enable notifications (Slack, PagerDuty) via the ArgoCD Notifications controller
- [ ] Store the ArgoCD Application manifests in Git — ArgoCD manages itself

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
kubectl get all -n production

# 8. Deploy new version — update image.tag in values-prod.yaml, commit, push, then:
argocd app sync color-app

# 9. Roll back if needed
argocd app rollback color-app 1
```
