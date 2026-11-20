

import json
import os
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import PurePosixPath

import boto3
from botocore.exceptions import ClientError


# AWS configuration is supplied through Lambda environment variables.
TABLE_NAME = os.environ.get("INVOICES_TABLE", "")
BUCKET_NAME = os.environ.get("INVOICE_BUCKET", "")

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
}

ALLOWED_EXTENSIONS = {
    "application/pdf": {".pdf"},
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
}

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")


def response(status_code, body=None):
    """Return an API Gateway HTTP API response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body or {}, default=json_serializer),
    }


def json_serializer(value):
    """Convert DynamoDB Decimal values into JSON-compatible numbers."""
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)

    raise TypeError(
        f"Type {type(value).__name__} is not JSON serializable"
    )


def get_table():
    if not TABLE_NAME:
        raise RuntimeError(
            "INVOICES_TABLE environment variable is missing."
        )

    return dynamodb.Table(TABLE_NAME)


def get_bucket():
    if not BUCKET_NAME:
        raise RuntimeError(
            "INVOICE_BUCKET environment variable is missing."
        )

    return BUCKET_NAME


def parse_body(event):
    body = event.get("body") or "{}"

    if event.get("isBase64Encoded"):
        import base64
        body = base64.b64decode(body).decode("utf-8")

    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise ValueError(
            "Request body must contain valid JSON."
        )


def validate_invoice_fields(data, partial=False):
    """Validate invoice metadata received from the API."""
    fields = {}

    if not partial or "supplier" in data:
        supplier = str(data.get("supplier", "")).strip()

        if not supplier:
            raise ValueError("Supplier is required.")

        fields["supplier"] = supplier

    if not partial or "amount" in data:
        try:
            amount = Decimal(str(data.get("amount", "")))
        except Exception:
            raise ValueError(
                "Amount must be a valid number."
            )

        if (
            not amount.is_finite()
            or amount <= 0
            or amount > Decimal("100000000")
        ):
            raise ValueError(
                "Amount must be greater than zero and no more than 100,000,000."
            )

        fields["amount"] = amount

    if not partial or "date" in data:
        invoice_date = str(data.get("date", "")).strip()

        try:
            date.fromisoformat(invoice_date)
        except ValueError:
            raise ValueError(
                "Date must use YYYY-MM-DD format."
            )

        fields["date"] = invoice_date

    if not partial or "status" in data:
        status = str(data.get("status", "")).strip()

        if status not in ("Paid", "Pending"):
            raise ValueError(
                "Status must be Paid or Pending."
            )

        fields["status"] = status

    return fields


def get_invoice(invoice_id):
    result = get_table().get_item(
        Key={"id": invoice_id}
    )

    return result.get("Item")


def list_invoices(event):
    query = event.get("queryStringParameters") or {}

    search_term = str(
        query.get("search", "")
    ).strip().lower()

    status_filter = str(
        query.get("status", "")
    ).strip()

    if status_filter and status_filter not in ("Paid", "Pending"):
        raise ValueError(
            "Status filter must be Paid or Pending."
        )

    table = get_table()
    items = []
    scan_kwargs = {}

    while True:
        result = table.scan(**scan_kwargs)

        for item in result.get("Items", []):
            # The counter item is internal and must never appear in the UI.
            if item.get("id") == "__COUNTER__":
                continue

            if status_filter and item.get("status") != status_filter:
                continue

            if search_term:
                searchable = (
                    str(item.get("id", ""))
                    + " "
                    + str(item.get("supplier", ""))
                ).lower()

                if search_term not in searchable:
                    continue

            items.append(item)

        last_key = result.get("LastEvaluatedKey")

        if not last_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_key

    items.sort(
        key=lambda item: item.get("date", ""),
        reverse=True,
    )

    return response(200, {"invoices": items})


def create_upload_url(event):
    data = parse_body(event)

    filename = str(
        data.get("fileName", "")
    ).strip()

    content_type = str(
        data.get("contentType", "")
    ).strip().lower()

    try:
        file_size = int(data.get("fileSize", 0))
    except (TypeError, ValueError):
        raise ValueError(
            "File size must be a valid number."
        )

    if not filename:
        raise ValueError("A filename is required.")

    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(
            "Only PDF, PNG and JPEG files are allowed."
        )

    safe_filename = PurePosixPath(
        filename.replace("\\", "/")
    ).name

    extension = PurePosixPath(
        safe_filename
    ).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS[content_type]:
        raise ValueError(
            "The filename extension does not match the file type."
        )

    if file_size <= 0 or file_size > MAX_FILE_SIZE:
        raise ValueError(
            "File must be greater than zero and no larger than 5 MB."
        )

    document_key = (
        f"invoices/{uuid.uuid4()}-{safe_filename}"
    )

    upload = s3.generate_presigned_post(
        Bucket=get_bucket(),
        Key=document_key,
        Fields={
            "Content-Type": content_type,
        },
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, MAX_FILE_SIZE],
        ],
        ExpiresIn=300,
    )

    return response(200, {
        "uploadUrl": upload["url"],
        "fields": upload["fields"],
        "documentKey": document_key,
        "expiresIn": 300,
    })


def create_invoice(event):
    data = parse_body(event)
    fields = validate_invoice_fields(data)

    file_name = str(
        data.get("fileName", "")
    ).strip()

    document_key = str(
        data.get("documentKey", "")
    ).strip()

    # Validate the original filename.
    safe_file_name = PurePosixPath(
        file_name.replace("\\", "/")
    ).name

    if (
        not file_name
        or safe_file_name != file_name
        or file_name in {".", ".."}
    ):
        raise ValueError(
            "A valid invoice filename is required."
        )

    extension = PurePosixPath(
        file_name
    ).suffix.lower()

    # Find the MIME type associated with this file extension.
    expected_content_type = next(
        (
            content_type
            for content_type, extensions in ALLOWED_EXTENSIONS.items()
            if extension in extensions
        ),
        None,
    )

    if not expected_content_type:
        raise ValueError(
            "Uploaded document type is not allowed."
        )

    # Validate the UUID-based document key generated during upload.
    # Expected format:
    # invoices/{uuid}-{filename}
    if not document_key.startswith("invoices/"):
        raise ValueError(
            "Invalid invoice document reference."
        )

    key_name = document_key[len("invoices/"):]

    if (
        len(key_name) <= 37
        or key_name[36:37] != "-"
        or key_name[37:] != file_name
    ):
        raise ValueError(
            "Invalid invoice document reference."
        )

    try:
        uuid.UUID(key_name[:36])
    except ValueError:
        raise ValueError(
            "Invalid invoice document reference."
        )

    # Confirm the document was actually uploaded to S3.
    try:
        document = s3.head_object(
            Bucket=get_bucket(),
            Key=document_key,
        )
    except ClientError:
        raise ValueError(
            "The invoice document could not be found in storage."
        )

    content_type = document.get("ContentType")

    if content_type != expected_content_type:
        raise ValueError(
            "Uploaded document type does not match its filename."
        )

    file_size = document.get("ContentLength", 0)

    if file_size <= 0:
        raise ValueError(
            "Uploaded document is empty."
        )

    if file_size > MAX_FILE_SIZE:
        raise ValueError(
            "Uploaded document exceeds the 5 MB limit."
        )

    # DynamoDB atomically increments the sequence to avoid duplicate IDs.
    counter_result = get_table().update_item(
        Key={"id": "__COUNTER__"},
        UpdateExpression="ADD invoiceSequence :increment",
        ExpressionAttributeValues={
            ":increment": Decimal("1")
        },
        ReturnValues="UPDATED_NEW",
    )

    sequence = int(
        counter_result["Attributes"]["invoiceSequence"]
    )

    invoice_id = f"INV-{sequence:03d}"

    item = {
        "id": invoice_id,
        **fields,
        "fileName": file_name,
        "documentKey": document_key,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    get_table().put_item(Item=item)

    return response(201, {
        "message": "Invoice created successfully.",
        "invoice": item,
    })


def get_download_url(invoice_id):
    invoice = get_invoice(invoice_id)

    if not invoice:
        return response(
            404,
            {"message": "Invoice not found."}
        )

    document_key = invoice.get("documentKey")

    if not document_key:
        return response(
            404,
            {"message": "No document is attached to this invoice."}
        )

    download_url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": get_bucket(),
            "Key": document_key,
        },
        ExpiresIn=300,
    )

    return response(200, {
        "downloadUrl": download_url,
        "expiresIn": 300,
    })


def get_single_invoice(invoice_id):
    invoice = get_invoice(invoice_id)

    if not invoice:
        return response(
            404,
            {"message": "Invoice not found."}
        )

    return response(200, {"invoice": invoice})


def update_invoice(invoice_id, event):
    data = parse_body(event)
    fields = validate_invoice_fields(
        data,
        partial=True,
    )

    if not fields:
        raise ValueError(
            "Provide at least one invoice field to update."
        )

    if not get_invoice(invoice_id):
        return response(
            404,
            {"message": "Invoice not found."}
        )

    expression_parts = []
    names = {}
    values = {}

    for index, (field, value) in enumerate(fields.items()):
        name_token = f"#field{index}"
        value_token = f":value{index}"

        expression_parts.append(
            f"{name_token} = {value_token}"
        )

        names[name_token] = field
        values[value_token] = value

    result = get_table().update_item(
        Key={"id": invoice_id},
        UpdateExpression="SET " + ", ".join(expression_parts),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )

    return response(200, {
        "message": "Invoice updated successfully.",
        "invoice": result["Attributes"],
    })


def delete_invoice(invoice_id):
    invoice = get_invoice(invoice_id)

    if not invoice:
        return response(
            404,
            {"message": "Invoice not found."}
        )

    document_key = invoice.get("documentKey")

    if document_key:
        s3.delete_object(
            Bucket=get_bucket(),
            Key=document_key,
        )

    get_table().delete_item(
        Key={"id": invoice_id}
    )

    return response(200, {
        "message": "Invoice deleted successfully."
    })


def lambda_handler(event, context):
    """Route API Gateway HTTP API requests to the appropriate operation."""
    try:
        request_context = event.get(
            "requestContext",
            {}
        )

        method = request_context.get(
            "http",
            {}
        ).get("method", "")

        path = event.get(
            "rawPath",
            "/"
        ).rstrip("/") or "/"

        if method == "OPTIONS":
            return response(204)

        if method == "GET" and path == "/invoices":
            return list_invoices(event)

        if method == "POST" and path == "/invoices/upload-url":
            return create_upload_url(event)

        if method == "POST" and path == "/invoices":
            return create_invoice(event)

        parts = path.strip("/").split("/")

        if len(parts) >= 2 and parts[0] == "invoices":
            invoice_id = parts[1]

            if (
                len(parts) == 3
                and parts[2] == "download-url"
                and method == "GET"
            ):
                return get_download_url(invoice_id)

            if len(parts) == 2:
                if method == "GET":
                    return get_single_invoice(invoice_id)

                if method == "PUT":
                    return update_invoice(invoice_id, event)

                if method == "DELETE":
                    return delete_invoice(invoice_id)

        return response(
            404,
            {"message": "Route not found."}
        )

    except ValueError as error:
        return response(
            400,
            {"message": str(error)}
        )

    except Exception:
        # Detailed errors should be inspected in CloudWatch,
        # not exposed to API callers.
        print(
            "Unexpected error while processing invoice request."
        )

        return response(
            500,
            {"message": "An unexpected server error occurred."}
        )


# AWS Lambda entry point
handler = lambda_handler
