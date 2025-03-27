locals {
  tags = {
    created-by = "eks-hilltop-prod"
    env        = var.cluster_name
  }
}