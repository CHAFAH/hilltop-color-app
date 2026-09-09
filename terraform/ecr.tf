# ECR repository for backend image
resource "aws_ecr_repository" "backend" {
  name                 = "color-app-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "color-app-backend"
    Environment = var.environment
  }
}

# ECR repository for frontend image
resource "aws_ecr_repository" "frontend" {
  name                 = "color-app-frontend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "color-app-frontend"
    Environment = var.environment
  }
}
