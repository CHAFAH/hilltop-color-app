# ECR repository for backend image
resource "aws_ecr_repository" "backend" {
  name                 = "employee-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "employee-backend"
    Environment = var.environment
  }
}

# ECR repository for frontend image
resource "aws_ecr_repository" "frontend" {
  name                 = "employee-frontend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "employee-frontend"
    Environment = var.environment
  }
}
