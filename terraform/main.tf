data "aws_caller_identity" "current" {}

locals {
  tags = {
    created-by = "eks-wandaprep-prod"
    env        = var.cluster_name
    managed-by = "terraform"
  }
}
