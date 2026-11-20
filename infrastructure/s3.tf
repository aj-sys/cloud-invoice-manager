
data "aws_caller_identity" "current" {}

# Private S3 bucket for invoice documents
resource "aws_s3_bucket" "invoice_documents" {
  bucket        = "${var.project_name}-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "Invoice document storage"
  }
}

# Block all public access to invoice documents
resource "aws_s3_bucket_public_access_block" "invoice_documents" {
  bucket = aws_s3_bucket.invoice_documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Ensure bucket owner controls uploaded objects
resource "aws_s3_bucket_ownership_controls" "invoice_documents" {
  bucket = aws_s3_bucket.invoice_documents.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Enable server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "invoice_documents" {
  bucket = aws_s3_bucket.invoice_documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Require HTTPS for access to invoice documents
resource "aws_s3_bucket_policy" "invoice_documents_tls" {
  bucket = aws_s3_bucket.invoice_documents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"

        Resource = [
          aws_s3_bucket.invoice_documents.arn,
          "${aws_s3_bucket.invoice_documents.arn}/*"
        ]

        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })

  depends_on = [
    aws_s3_bucket_public_access_block.invoice_documents
  ]
}

# Allow local development and the hosted frontend to access documents
resource "aws_s3_bucket_cors_configuration" "invoice_documents" {
  bucket = aws_s3_bucket.invoice_documents.id

  cors_rule {
    allowed_headers = ["*"]

    allowed_methods = [
      "POST",
      "GET",
      "HEAD"
    ]

    allowed_origins = [
      "http://127.0.0.1:5532",
      "http://${aws_s3_bucket_website_configuration.frontend_website.website_endpoint}"
    ]

    expose_headers  = ["ETag"]
    max_age_seconds = 300
  }
}
