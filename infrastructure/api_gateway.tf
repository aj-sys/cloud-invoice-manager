
# HTTP API for Cloud Invoice Manager
resource "aws_apigatewayv2_api" "invoice_api" {
  name          = "${var.project_name}-${var.environment}-http-api"
  protocol_type = "HTTP"
  description   = "HTTP API for the Cloud Invoice Manager"

  cors_configuration {
    allow_origins = [
      "http://127.0.0.1:5532",
      "http://${aws_s3_bucket_website_configuration.frontend_website.website_endpoint}"
    ]

    allow_methods = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "OPTIONS"
    ]

    allow_headers = [
      "content-type",
      "authorization"
    ]

    max_age = 300
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# Connect API Gateway to Lambda
resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id = aws_apigatewayv2_api.invoice_api.id

  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.invoice_api.invoke_arn
  integration_method = "POST"

  payload_format_version = "2.0"
}

# Route API requests to Lambda
resource "aws_apigatewayv2_route" "proxy_route" {
  api_id = aws_apigatewayv2_api.invoice_api.id

  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# Handle requests to the API root
resource "aws_apigatewayv2_route" "root_route" {
  api_id = aws_apigatewayv2_api.invoice_api.id

  route_key = "ANY /"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# Allow API Gateway to invoke Lambda
resource "aws_lambda_permission" "allow_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.invoice_api.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.invoice_api.execution_arn}/*/*"
}

# Default API stage with request throttling
resource "aws_apigatewayv2_stage" "default" {
  api_id = aws_apigatewayv2_api.invoice_api.id

  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 5
    throttling_rate_limit  = 2
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

output "api_endpoint" {
  description = "HTTPS endpoint for the Cloud Invoice Manager API"
  value       = aws_apigatewayv2_api.invoice_api.api_endpoint
}
