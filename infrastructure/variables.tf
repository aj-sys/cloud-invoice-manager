variable "aws_region" {
  description = "AWS region for the Cloud Invoice Manager project"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name used to identify project resources"
  type        = string
  default     = "cloud-invoice-manager"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}