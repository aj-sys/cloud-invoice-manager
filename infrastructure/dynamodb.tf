
resource "aws_dynamodb_table" "invoices" {
  name         = "${var.project_name}-${var.environment}-invoices"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}
