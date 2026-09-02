# Kubernetes — WANDAPREP Training Guide

---

## 1. What is Kubernetes?

Kubernetes (K8s) is an open-source container orchestration platform originally developed by Google and donated to the Cloud Native Computing Foundation (CNCF). It automates the deployment, scaling, and management of containerized applications across a cluster of machines.

Instead of manually running containers on individual servers, Kubernetes lets you declare the **desired state** of your application — how many copies should run, what resources they need, how they should be exposed — and the platform continuously works to maintain that state.

Key capabilities:
- **Self-healing** — restarts failed containers, replaces pods on unhealthy nodes
- **Horizontal scaling** — scale up or down with one command or automatically
- **Service discovery and load balancing** — built-in DNS and traffic routing between pods
- **Rolling updates and rollbacks** — deploy new versions with zero downtime
- **Configuration management** — decouple config and secrets from container images

---

## 2. Kubernetes Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         CONTROL PLANE                            │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  kube-apiserver │  │kube-scheduler│  │kube-controller-mgr │  │
│  └────────┬────────┘  └──────────────┘  └────────────────────┘  │
│           │                                                       │
│  ┌────────▼────────┐  ┌──────────────────────┐                  │
│  │      etcd       │  │ cloud-controller-mgr  │                  │
│  └─────────────────┘  └──────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
  ┌────────▼──────┐   ┌────────▼──────┐   ┌────────▼──────┐
  │  Worker Node  │   │  Worker Node  │   │  Worker Node  │
  │               │   │               │   │               │
  │  kubelet      │   │  kubelet      │   │  kubelet      │
  │  kube-proxy   │   │  kube-proxy   │   │  kube-proxy   │
  │  containerd   │   │  containerd   │   │  containerd   │
  │               │   │               │   │               │
  │  [Pod][Pod]   │   │  [Pod][Pod]   │   │  [Pod][Pod]   │
  └───────────────┘   └───────────────┘   └───────────────┘
```

### Control Plane Components

| Component | Role |
|---|---|
| **kube-apiserver** | The front door of the cluster. Every request — from kubectl, controllers, or nodes — goes through the API server. It validates requests and persists state to etcd. |
| **etcd** | A distributed key-value store that holds the entire cluster state. Every object, every config, every status lives here. It is the single source of truth. |
| **kube-scheduler** | Watches for pods with no assigned node and picks the best node based on resource availability, affinity rules, taints, and tolerations. |
| **kube-controller-manager** | Runs all built-in controllers in one process. Each controller watches the API server and reconciles actual state toward desired state (e.g. the ReplicaSet controller ensures the right number of pods are always running). |
| **cloud-controller-manager** | Integrates with the cloud provider (AWS). Manages cloud resources like Load Balancers, node lifecycle, and routes. |

### Worker Node Components

| Component | Role |
|---|---|
| **kubelet** | An agent on every node. Receives pod specs from the API server and ensures the described containers are running and healthy. |
| **kube-proxy** | Maintains network rules on each node so pods can communicate with each other and with external traffic. |
| **Container Runtime** | The software that actually runs containers (containerd). The kubelet talks to it via the CRI interface. |

---

## 3. Provision the EKS Cluster with Terraform

The `terraform/` directory provisions:
- A production-grade VPC across 3 Availability Zones with one NAT Gateway per AZ and VPC Flow Logs
- An EKS 1.31 cluster with managed node groups (`t3.medium`)
- Core addons: `coredns`, `kube-proxy`, `vpc-cni`, `aws-ebs-csi-driver` — all pinned to `most_recent`
- IRSA roles for the EBS CSI Driver and the AWS Load Balancer Controller
- AWS Load Balancer Controller deployed via Helm (2 replicas)
- A default `gp3` encrypted StorageClass

### Deploy

```bash
cd terraform/

terraform init
terraform plan
terraform apply        # takes ~15 minutes
```

### Connect kubectl to the cluster

```bash
aws eks update-kubeconfig \
  --region us-east-1 \
  --name eks-wandaprep-prod
```

Verify:

```bash
kubectl get nodes
```

Expected:

```
NAME                          STATUS   ROLES    AGE   VERSION
ip-10-42-x-x.ec2.internal     Ready    <none>   5m    v1.31.x
ip-10-42-x-x.ec2.internal     Ready    <none>   5m    v1.31.x
ip-10-42-x-x.ec2.internal     Ready    <none>   5m    v1.31.x
```

---

## 4. Verify the AWS Load Balancer Controller

The AWS Load Balancer Controller (LBC) provisions ALBs and NLBs in response to Kubernetes Service and Ingress objects. It was deployed by Terraform into the `kube-system` namespace.

```bash
# Check pods
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

Expected:

```
NAME                                           READY   STATUS    RESTARTS   AGE
aws-load-balancer-controller-xxxxxxxx-xxxxx    1/1     Running   0          3m
aws-load-balancer-controller-xxxxxxxx-xxxxx    1/1     Running   0          3m
```

```bash
# Check logs
kubectl logs -n kube-system \
  -l app.kubernetes.io/name=aws-load-balancer-controller \
  --tail=20
```

```bash
# Confirm IRSA annotation is present
kubectl get serviceaccount aws-load-balancer-controller \
  -n kube-system \
  -o jsonpath='{.metadata.annotations}'
```

Expected:

```json
{"eks.amazonaws.com/role-arn":"arn:aws:iam::<account-id>:role/eks-wandaprep-prod-aws-lbc"}
```

---

## 5. The WANDAPREP Application

The app is a Node.js/Express server (`chafah/wandaprep:v1.0`) that:
- Serves a full-page HTML response with a background color and runtime config values
- Reads four environment variables — `APP_COLOR`, `APP_ENV`, `APP_MESSAGE`, `SECRET_KEY`
- Falls back to safe defaults if no env vars are set (`APP_COLOR=red`, etc.)
- Prints a clear startup banner to stdout the moment it is ready

### Startup log

Every time a pod starts, the app prints this banner to stdout. When you run `kubectl logs`, this is what confirms the pod is alive and what configuration it loaded:

```
================================================================
  ✅  IF YOU SEE THIS LOG, THE WANDAPREP APP IS RUNNING!
================================================================
  Timestamp   : 2024-xx-xxTxx:xx:xx.xxxZ
  Port        : 8080
  Environment : development
  Color       : red
  Message     : Hello from WANDAPREP!
  Secret Key  : not-set
----------------------------------------------------------------
  These values come from:
    APP_COLOR   → ConfigMap  (wandaprep-config)
    APP_ENV     → ConfigMap  (wandaprep-config)
    APP_MESSAGE → ConfigMap  (wandaprep-config)
    SECRET_KEY  → Secret     (wandaprep-secret)
================================================================
```

When no env vars are injected (bare pod), you will see the defaults: `color=red`, `env=development`, `secret=not-set`. This is intentional — it shows students exactly what changes when ConfigMaps and Secrets are introduced later.

---

## 6. Kubernetes Objects

The sections below follow a deliberate learning progression:

```
Pod  →  ReplicaSet  →  Deployment  →  Service  →  ConfigMap  →  Secret  →  Namespace  →  Ingress  →  PVC  →  HPA
```

Each section builds on the previous one.

---

### 6.1 Pod

A Pod is the smallest deployable unit in Kubernetes. It wraps one or more containers that share the same network namespace and storage volumes. Containers inside the same pod communicate over `localhost`.

We start with the simplest possible pod — just the image and port. No environment variables. The app will use its built-in defaults (`APP_COLOR=red`). This is intentional: it shows the app running on its own before we introduce configuration objects.

**Manifest — `kubernetes/POD/pod.yaml`**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: wandaprep-app
  labels:
    app: wandaprep
spec:
  containers:
  - name: wandaprep-app-container
    image: chafah/wandaprep:v1.0
    ports:
    - containerPort: 8080
```

**Apply:**

```bash
kubectl apply -f kubernetes/POD/pod.yaml
```

**Watch it start:**

```bash
kubectl get pod wandaprep-app -w
```

```
NAME             READY   STATUS              RESTARTS   AGE
wandaprep-app    0/1     ContainerCreating   0          2s
wandaprep-app    1/1     Running             0          7s
```

**Get the logs — confirm the app is running:**

```bash
kubectl logs wandaprep-app
```

You will see the startup banner. Because no env vars were injected, the app is running with defaults:

```
================================================================
  ✅  IF YOU SEE THIS LOG, THE WANDAPREP APP IS RUNNING!
================================================================
  Timestamp   : 2024-xx-xxTxx:xx:xx.xxxZ
  Port        : 8080
  Environment : development
  Color       : red
  Message     : Hello from WANDAPREP!
  Secret Key  : not-set
----------------------------------------------------------------
  These values come from:
    APP_COLOR   → ConfigMap  (wandaprep-config)
    APP_ENV     → ConfigMap  (wandaprep-config)
    APP_MESSAGE → ConfigMap  (wandaprep-config)
    SECRET_KEY  → Secret     (wandaprep-secret)
================================================================
```

**Other useful commands:**

```bash
kubectl describe pod wandaprep-app     # full detail: node, events, image, status
kubectl logs wandaprep-app -f          # follow logs in real time
kubectl exec -it wandaprep-app -- sh   # open a shell inside the container
```

**Delete when done:**

```bash
kubectl delete pod wandaprep-app
```

> **Key takeaway:** A bare pod has no self-healing. If it crashes or is deleted, it is gone. That is why we use ReplicaSets and Deployments.

---

### 6.2 ReplicaSet

A ReplicaSet ensures a specified number of identical pod replicas are running at all times. If a pod crashes or is deleted, the ReplicaSet controller immediately creates a replacement.

> In practice you manage ReplicaSets indirectly through Deployments. But understanding them directly is important.

**Manifest — `kubernetes/REPLICASET/replicaset.yaml`**

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: wandaprep-replicaset
spec:
  replicas: 3
  selector:
    matchLabels:
      app: wandaprep
  template:
    metadata:
      labels:
        app: wandaprep
    spec:
      containers:
      - name: wandaprep-container
        image: chafah/wandaprep:v1.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "250m"
            memory: "256Mi"
```

**Apply and verify:**

```bash
kubectl apply -f kubernetes/REPLICASET/replicaset.yaml

kubectl get replicaset wandaprep-replicaset
kubectl get pods -l app=wandaprep
```

**Check logs on all 3 pods at once:**

```bash
kubectl logs -l app=wandaprep --prefix=true
```

Each pod prints the startup banner — you will see 3 entries, one per pod.

**Test self-healing — delete one pod and watch it come back:**

```bash
kubectl delete pod <pod-name>
kubectl get pods -l app=wandaprep -w
```

**Delete:**

```bash
kubectl delete replicaset wandaprep-replicaset
```

> **Key takeaway:** A ReplicaSet gives you resilience but no rolling updates. That is what Deployments add.

---

### 6.3 Deployment

A Deployment is the standard way to run stateless applications in Kubernetes. It owns a ReplicaSet and adds rolling update and rollback capabilities. When you change the image or config, the Deployment creates a new ReplicaSet and gradually shifts pods to it while scaling down the old one — zero downtime.

**Manifest — `kubernetes/DEPLOYMENT/deploy.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wandaprep-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: wandaprep
  template:
    metadata:
      labels:
        app: wandaprep
    spec:
      containers:
      - name: wandaprep-container
        image: chafah/wandaprep:v1.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "250m"
            memory: "256Mi"
```

**Apply and verify:**

```bash
kubectl apply -f kubernetes/DEPLOYMENT/deploy.yaml

kubectl get deployment wandaprep-deployment
kubectl get replicaset
kubectl get pods -l app=wandaprep
```

**Check logs across all pods:**

```bash
kubectl logs -l app=wandaprep --prefix=true
```

**Rolling update — change the image tag:**

```bash
kubectl set image deployment/wandaprep-deployment wandaprep-container=chafah/wandaprep:v2.0
kubectl rollout status deployment/wandaprep-deployment
```

**Rollback:**

```bash
kubectl rollout undo deployment/wandaprep-deployment
kubectl rollout history deployment/wandaprep-deployment
```

**Scale:**

```bash
kubectl scale deployment wandaprep-deployment --replicas=5
```

---

### 6.4 Service — NodePort

A Service gives pods a stable network identity. Pod IPs change every time a pod is recreated — a Service provides a fixed ClusterIP and DNS name that always routes to healthy pods via label selectors.

A **NodePort** Service exposes the app on a static port on every node's IP. Good for testing without a cloud load balancer.

**Manifest — `kubernetes/POD/nps-svc.yaml`**

```yaml
kind: Service
apiVersion: v1
metadata:
  name: wandaprep-app-svc
spec:
  selector:
    app: wandaprep
  type: NodePort
  ports:
  - name: tcp
    port: 80
    targetPort: 8080
    nodePort: 31200
```

**Apply and verify:**

```bash
kubectl apply -f kubernetes/POD/nps-svc.yaml

kubectl get service wandaprep-app-svc
kubectl describe service wandaprep-app-svc
```

**Access the app:**

```bash
curl http://<NODE_PUBLIC_IP>:31200
```

---

### 6.5 Service — LoadBalancer

A **LoadBalancer** Service provisions a cloud load balancer via the AWS Load Balancer Controller and assigns it a public DNS hostname. This is the standard way to expose apps to the internet on EKS.

**Manifest — `kubernetes/DEPLOYMENT/lb-svc.yaml`**

```yaml
kind: Service
apiVersion: v1
metadata:
  name: wandaprep-lb-svc
spec:
  selector:
    app: wandaprep
  type: LoadBalancer
  ports:
  - name: tcp
    port: 80
    targetPort: 8080
```

**Apply and verify:**

```bash
kubectl apply -f kubernetes/DEPLOYMENT/lb-svc.yaml

kubectl get service wandaprep-lb-svc -w
```

Wait ~60 seconds for `EXTERNAL-IP` to be populated:

```
NAME               TYPE           CLUSTER-IP    EXTERNAL-IP                          PORT(S)       AGE
wandaprep-lb-svc   LoadBalancer   172.20.x.x    xxxx.us-east-1.elb.amazonaws.com     80:xxxxx/TCP  90s
```

**Access the app:**

```bash
curl http://xxxx.us-east-1.elb.amazonaws.com
```

The page will show `Color: red` and `Secret Key: not-set` because we have not injected any env vars yet. That changes in the next two sections.

---

### 6.6 ConfigMap

A ConfigMap decouples non-sensitive configuration from the container image. Instead of rebuilding the image every time a config value changes, you update the ConfigMap and restart the pod.

Our app reads `APP_COLOR`, `APP_ENV`, and `APP_MESSAGE` from env vars. Without a ConfigMap those fall back to defaults. With a ConfigMap we can control them at runtime without touching the image.

**Manifest — `kubernetes/CONFIGMAP/configmap.yaml`**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: wandaprep-config
data:
  APP_COLOR: "blue"
  APP_ENV: "production"
  APP_MESSAGE: "Welcome to WANDAPREP Kubernetes Training!"
```

**Apply:**

```bash
kubectl apply -f kubernetes/CONFIGMAP/configmap.yaml

kubectl get configmap wandaprep-config
kubectl describe configmap wandaprep-config
```

**Now update the Deployment to consume the ConfigMap:**

```yaml
        env:
        - name: APP_COLOR
          valueFrom:
            configMapKeyRef:
              name: wandaprep-config
              key: APP_COLOR
        - name: APP_ENV
          valueFrom:
            configMapKeyRef:
              name: wandaprep-config
              key: APP_ENV
        - name: APP_MESSAGE
          valueFrom:
            configMapKeyRef:
              name: wandaprep-config
              key: APP_MESSAGE
```

After applying the updated Deployment, check the logs:

```bash
kubectl logs -l app=wandaprep --prefix=true
```

The startup banner now shows the values from the ConfigMap:

```
================================================================
  ✅  IF YOU SEE THIS LOG, THE WANDAPREP APP IS RUNNING!
================================================================
  Timestamp   : 2024-xx-xxTxx:xx:xx.xxxZ
  Port        : 8080
  Environment : production
  Color       : blue
  Message     : Welcome to WANDAPREP Kubernetes Training!
  Secret Key  : not-set
================================================================
```

The page background is now **blue** and the message is visible on screen — driven entirely by the ConfigMap, no image rebuild needed.

**Change the color without touching the image:**

```bash
kubectl edit configmap wandaprep-config   # change APP_COLOR to green
kubectl rollout restart deployment/wandaprep-deployment
kubectl logs -l app=wandaprep --prefix=true
```

---

### 6.7 Secret

A Secret stores sensitive data — passwords, API keys, tokens — separately from ConfigMaps. Values are base64-encoded and Kubernetes can restrict access to them via RBAC. Never put sensitive values in a ConfigMap.

Our app reads `SECRET_KEY` from env. Without a Secret it shows `not-set`. With a Secret it shows the real value.

**Encode your secret value:**

```bash
echo -n "wandaprep-secret-2024" | base64
# d2FuZGFwcmVwLXNlY3JldC0yMDI0
```

**Manifest — `kubernetes/SECRET/secret.yaml`**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: wandaprep-secret
type: Opaque
data:
  SECRET_KEY: d2FuZGFwcmVwLXNlY3JldC0yMDI0
```

**Apply:**

```bash
kubectl apply -f kubernetes/SECRET/secret.yaml

kubectl get secret wandaprep-secret
kubectl describe secret wandaprep-secret   # values are hidden — shown as <hidden>
```

**Now add the Secret to the Deployment:**

```yaml
        - name: SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: wandaprep-secret
              key: SECRET_KEY
```

After applying, check the logs:

```bash
kubectl logs -l app=wandaprep --prefix=true
```

The startup banner now shows the secret value:

```
================================================================
  ✅  IF YOU SEE THIS LOG, THE WANDAPREP APP IS RUNNING!
================================================================
  Timestamp   : 2024-xx-xxTxx:xx:xx.xxxZ
  Port        : 8080
  Environment : production
  Color       : blue
  Message     : Welcome to WANDAPREP Kubernetes Training!
  Secret Key  : wandaprep-secret-2024
================================================================
```

The page now shows `Secret Key: wandaprep-secret-2024` — injected from the Secret, not hardcoded in the image.

The full Deployment manifest with both ConfigMap and Secret wired in lives at `kubernetes/DEPLOYMENT/deploy.yaml`.

---

### 6.8 Namespace

Namespaces isolate groups of resources within a single cluster. Different teams, environments (dev/staging/prod), or applications each get their own namespace with independent resource quotas and RBAC policies.

**Manifest — `kubernetes/NAMESPACE/namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: wandaprep-prod
  labels:
    env: production
    team: wandaprep
```

**Apply and verify:**

```bash
kubectl apply -f kubernetes/NAMESPACE/namespace.yaml
kubectl get namespaces
```

**Deploy the app into the namespace:**

```bash
kubectl apply -f kubernetes/CONFIGMAP/configmap.yaml -n wandaprep-prod
kubectl apply -f kubernetes/SECRET/secret.yaml       -n wandaprep-prod
kubectl apply -f kubernetes/DEPLOYMENT/deploy.yaml   -n wandaprep-prod

kubectl get pods -n wandaprep-prod
kubectl logs -l app=wandaprep -n wandaprep-prod --prefix=true
```

---

### 6.9 Ingress

An Ingress exposes HTTP/HTTPS routes from outside the cluster to services inside. Unlike a LoadBalancer Service (one cloud LB per service), a single Ingress can route to multiple services based on hostname or path — much more cost-efficient.

On EKS with the AWS Load Balancer Controller, an Ingress provisions an Application Load Balancer (ALB).

**Manifest — `kubernetes/INGRESS/ingress.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: wandaprep-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  rules:
  - host: app.wandaprep.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: wandaprep-lb-svc
            port:
              number: 80
```

**Apply and verify:**

```bash
kubectl apply -f kubernetes/INGRESS/ingress.yaml

kubectl get ingress wandaprep-ingress
kubectl describe ingress wandaprep-ingress
```

The `ADDRESS` column shows the ALB DNS name once provisioned (~60 seconds).

---

### 6.10 PersistentVolumeClaim (PVC)

A PersistentVolumeClaim requests durable storage from the cluster. On EKS with the EBS CSI Driver and the `gp3` StorageClass provisioned by Terraform, a PVC automatically creates and attaches an EBS volume.

**Manifest — `kubernetes/PVC/pvc.yaml`**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: wandaprep-logs-pvc
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 5Gi
```

**Apply and verify:**

```bash
kubectl apply -f kubernetes/PVC/pvc.yaml
kubectl get pvc wandaprep-logs-pvc
```

Status moves `Pending` → `Bound` once a pod mounts it (`WaitForFirstConsumer` binding mode).

**Mount it in a pod to persist the app logs:**

```yaml
    volumeMounts:
    - name: logs-storage
      mountPath: /usr/src/app/logs
  volumes:
  - name: logs-storage
    persistentVolumeClaim:
      claimName: wandaprep-logs-pvc
```

---

### 6.11 HorizontalPodAutoscaler (HPA)

An HPA automatically scales the number of pod replicas based on observed CPU or memory utilisation. It queries the Metrics Server and adjusts the Deployment replica count up or down within the bounds you define.

**Manifest — `kubernetes/HPA/hpa.yaml`**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: wandaprep-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: wandaprep-deployment
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
```

**Apply and verify:**

```bash
kubectl apply -f kubernetes/HPA/hpa.yaml

kubectl get hpa wandaprep-hpa
kubectl describe hpa wandaprep-hpa
```

---

## 7. Learning Progression Summary

| Step | Object | What it teaches |
|---|---|---|
| 1 | **Pod** | Smallest unit. App runs with defaults — no config injected. Read logs to confirm it is alive. |
| 2 | **ReplicaSet** | Self-healing. Delete a pod and watch it come back. |
| 3 | **Deployment** | Rolling updates and rollbacks on top of a ReplicaSet. |
| 4 | **Service (NodePort)** | Stable network access to pods via label selector. |
| 5 | **Service (LoadBalancer)** | Cloud load balancer. App is reachable from the internet. Color is still red — no config yet. |
| 6 | **ConfigMap** | Inject `APP_COLOR`, `APP_ENV`, `APP_MESSAGE`. Page changes color. Logs show new values. |
| 7 | **Secret** | Inject `SECRET_KEY`. Logs and page show the secret value. Understand the difference from ConfigMap. |
| 8 | **Namespace** | Isolate the full stack into `wandaprep-prod`. |
| 9 | **Ingress** | Route traffic via ALB. One LB for multiple services. |
| 10 | **PVC** | Persist app logs to an EBS volume. |
| 11 | **HPA** | Auto-scale based on CPU. |

---

## 8. Essential kubectl Commands

```bash
# Cluster
kubectl cluster-info
kubectl get nodes -o wide

# Pods
kubectl get pods -A                           # all namespaces
kubectl get pods -l app=wandaprep             # filter by label
kubectl describe pod <pod-name>               # events, status, node placement
kubectl logs <pod-name>                       # stdout — look for the startup banner
kubectl logs <pod-name> -f                    # follow in real time
kubectl logs -l app=wandaprep --prefix=true   # logs from all matching pods
kubectl exec -it <pod-name> -- sh             # shell into the container

# Deployments
kubectl get deployments
kubectl rollout status deployment/wandaprep-deployment
kubectl rollout history deployment/wandaprep-deployment
kubectl rollout undo deployment/wandaprep-deployment
kubectl scale deployment wandaprep-deployment --replicas=5
kubectl rollout restart deployment/wandaprep-deployment

# Config
kubectl get configmap wandaprep-config -o yaml
kubectl get secret wandaprep-secret -o yaml

# Services
kubectl get services
kubectl get service wandaprep-lb-svc -w       # watch for EXTERNAL-IP

# Apply / delete
kubectl apply -f <file>
kubectl delete -f <file>

# Debugging
kubectl get events --sort-by=.lastTimestamp
kubectl top pods
kubectl top nodes
```

---

## 9. Object Relationship Map

```
Namespace (wandaprep-prod)
└── Deployment (wandaprep-deployment)
    ├── owns ──────────► ReplicaSet
    │                     └── manages ──► Pod  Pod  Pod
    │                                      └── Container: chafah/wandaprep:v1.0
    │                                            ├── env ◄── ConfigMap (APP_COLOR, APP_ENV, APP_MESSAGE)
    │                                            ├── env ◄── Secret    (SECRET_KEY)
    │                                            └── vol ◄── PVC ──► EBS gp3 Volume
    │
    ├── exposed by ────► Service/NodePort      (port 31200)
    ├── exposed by ────► Service/LoadBalancer  (AWS NLB → port 80)
    ├── exposed by ────► Ingress               (AWS ALB → app.wandaprep.com)
    └── scaled by ─────► HorizontalPodAutoscaler (2–10 replicas, 60% CPU)
```
