
output "lambda_function_name" {
  description = "Name of the invoice processing Lambda function"
  value       = aws_lambda_function.invoice_api.function_name
}

output "dynamodb_table_name" {
  description = "Name of the invoice metadata table"
  value       = aws_dynamodb_table.invoices.name
}

output "invoice_documents_bucket" {
  description = "Private S3 bucket for invoice documents"
  value       = aws_s3_bucket.invoice_documents.bucket
}

output "frontend_website_bucket" {
  description = "S3 bucket for the frontend website"
  value       = aws_s3_bucket.frontend_website.bucket
}

output "api_gateway_endpoint" {
  description = "HTTPS endpoint for the application API"
  value       = aws_apigatewayv2_api.invoice_api.api_endpoint
}
