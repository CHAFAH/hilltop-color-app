# Cluster outputs
output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "app_bucket_name" {
  value = aws_s3_bucket.app.bucket
}

output "app_irsa_role_arn" {
  description = "Service account role ARN (ECR + CloudWatch)"
  value       = module.app_irsa.iam_role_arn
}

output "lb_controller_role_arn" {
  value = module.lb_controller_irsa.iam_role_arn
}

output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --name ${var.cluster_name}-${var.environment} --region ${var.region} --profile terraform"
}

# ECR outputs
output "ecr_backend_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_url" {
  value = aws_ecr_repository.frontend.repository_url
}
