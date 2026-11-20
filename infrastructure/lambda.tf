
# Package the Lambda handler
data "archive_file" "lambda_package" {
  type        = "zip"
  output_path = "${path.module}/cloud_invoice_manager.zip"

  source {
    content  = file("${path.module}/../backend/lambda/handler.py")
    filename = "handler.py"
  }
}

# Invoice processing Lambda function
resource "aws_lambda_function" "invoice_api" {
  function_name = local.lambda_function_name
  description   = "API backend for the Cloud Invoice Manager application"

  role = aws_iam_role.lambda_execution_role.arn

  runtime = "python3.12"
  handler = "handler.lambda_handler"

  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  timeout     = 30
  memory_size = 256

  # Limit simultaneous executions to control usage


  environment {
    variables = {
      INVOICES_TABLE = aws_dynamodb_table.invoices.name
      INVOICE_BUCKET = aws_s3_bucket.invoice_documents.bucket
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }

  depends_on = [
    aws_iam_role_policy.lambda_permissions,
    aws_cloudwatch_log_group.lambda_logs
  ]
}
