# ECR repository for color-app
resource "aws_ecr_repository" "app" {
  name                 = "color-app"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "color-app"
    Environment = var.environment
  }
}
