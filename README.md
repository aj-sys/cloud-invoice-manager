# Cloud Invoice Manager

A cloud-based invoice management application designed to help businesses organise, track and manage invoice records.

**Project Status:** Local prototype completed | AWS deployment in progress

## Project Overview

Cloud Invoice Manager is a web application that provides a simple dashboard for managing business invoices. Users can add invoice records, view invoice information, search and filter records, update invoice details, and delete invoices.

The project is being developed as a practical AWS cloud deployment project, demonstrating cloud application development, serverless architecture, infrastructure security and deployment.

## Features

The current local prototype supports:

- **Dashboard:** Displays total invoices, total invoice value, paid invoices and pending invoices.
- **Add Invoices:** Records supplier details, invoice amount, date, payment status and document filename.
- **View Invoices:** Displays invoice records in a structured table.
- **Search:** Finds invoices by invoice ID or supplier name.
- **Filter:** Filters invoices by payment status.
- **Edit:** Updates supplier, amount, date and payment status.
- **Delete:** Removes invoice records after user confirmation.
- **Automatic Calculations:** Updates dashboard metrics when invoice records change.
- **Input Validation:** Checks required fields, invoice amounts, document types and file size.

**Current limitation:** The local prototype stores invoice metadata in browser local storage. It does not upload or retain the actual invoice document contents.

## Technology Stack

### Current implementation

- HTML5
- CSS3
- JavaScript
- Browser Local Storage
- Python (backend development and testing)

### Planned AWS integration

| AWS Service | Purpose |
|---|---|
| Amazon S3 | Static website hosting and invoice document storage |
| AWS Lambda | Serverless backend processing |
| Amazon API Gateway | API endpoints for frontend-backend communication |
| Amazon DynamoDB | Persistent invoice metadata storage |
| AWS IAM | Access control and permissions |
| Amazon CloudWatch | Logging and monitoring |

The AWS components will be implemented and tested as the project progresses.

## Project Structure

```text
cloud-invoice-manager/
│
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── backend/
│   └── lambda/
│       ├── handler.py
│       └── requirements.txt
│
├── tests/
│   └── test_handler.py
│
├── architecture/
│
├── docs/
│   ├── screenshots/
│   ├── implementation-guide.md
│   ├── architecture-decisions.md
│   ├── security-and-iam.md
│   └── testing-and-troubleshooting.md
│
├── demo/
│   └── demo-script.md
│
├── README.md
└── .gitignore
```

## Running the Local Application

1. Clone the repository:

```bash
git clone https://github.com/aj-sys/cloud-invoice-manager.git
```

2. Open the project folder in Visual Studio Code.

3. Open `frontend/index.html` using a local development server, such as the VS Code Live Server extension.

4. Use the dashboard to add, search, filter, edit and delete invoice records.

No AWS account or cloud resources are required to run the current local prototype.

## Security Considerations

The project will demonstrate:

- Least-privilege IAM permissions.
- Secure communication between frontend and backend.
- Controlled access to invoice documents.
- Input validation and error handling.
- Monitoring and logging through CloudWatch.

Client-side validation in the current prototype is for demonstration purposes and will be reinforced with backend validation during AWS integration.

## Project Documentation

Implementation notes, architecture decisions, security considerations, testing information and project screenshots are maintained in the `docs/` directory.

## Project Demonstration

A short demonstration video will be added here after the application is completed and deployed.

## Project Objectives

This project aims to demonstrate practical skills in:

- Web application development.
- AWS cloud services integration.
- Serverless application architecture.
- Infrastructure security and access management.
- Cloud deployment and monitoring.
- Technical documentation and testing.

## Author

**Ajara Amadu**

AWS Certified | Associate Cloud Trainer | Cloud and DevOps Practitioner

- GitHub: [aj-sys](https://github.com/aj-sys)
- LinkedIn: [Ajara Amadu](https://www.linkedin.com/in/ajara-amadu-profile/)
