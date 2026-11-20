
# Public S3 bucket for the static frontend website.
resource "aws_s3_bucket" "frontend_website" {
  bucket = "${var.project_name}-${var.environment}-website-${data.aws_caller_identity.current.account_id}"

  force_destroy = false

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Static frontend website"
  }
}

# Allow public access only through the bucket policy.
resource "aws_s3_bucket_public_access_block" "frontend_website" {
  bucket = aws_s3_bucket.frontend_website.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

# Configure S3 static website hosting.
resource "aws_s3_bucket_website_configuration" "frontend_website" {
  bucket = aws_s3_bucket.frontend_website.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# Allow visitors to read website files.
resource "aws_s3_bucket_policy" "frontend_website_public_read" {
  bucket = aws_s3_bucket.frontend_website.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [{
      Sid       = "PublicReadWebsiteFiles"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend_website.arn}/*"
    }]
  })

  depends_on = [
    aws_s3_bucket_public_access_block.frontend_website
  ]
}

# Display the static website endpoint after deployment.
output "frontend_website_endpoint" {
  description = "S3 static website endpoint for the frontend"
  value       = aws_s3_bucket_website_configuration.frontend_website.website_endpoint
}
