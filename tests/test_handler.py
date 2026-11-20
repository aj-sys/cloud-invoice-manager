

import json
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add the Lambda folder to Python's import path.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
LAMBDA_FOLDER = PROJECT_ROOT / "backend" / "lambda"
sys.path.insert(0, str(LAMBDA_FOLDER))

import handler


class TestCloudInvoiceManager(unittest.TestCase):

    def test_json_serializer_converts_decimal_to_number(self):
        self.assertEqual(
            handler.json_serializer(Decimal("1250")),
            1250,
        )

        self.assertEqual(
            handler.json_serializer(Decimal("12.50")),
            12.5,
        )

    def test_json_serializer_rejects_unsupported_types(self):
        with self.assertRaises(TypeError):
            handler.json_serializer(object())

    def test_validate_invoice_fields_accepts_valid_invoice(self):
        invoice = {
            "supplier": "Kumasi Office Supplies",
            "amount": "1250.00",
            "date": "2026-11-05",
            "status": "Paid",
        }

        result = handler.validate_invoice_fields(invoice)

        self.assertEqual(
            result["supplier"],
            "Kumasi Office Supplies",
        )

        self.assertEqual(
            result["amount"],
            Decimal("1250.00"),
        )

        self.assertEqual(
            result["date"],
            "2026-11-05",
        )

        self.assertEqual(
            result["status"],
            "Paid",
        )

    def test_validate_invoice_fields_rejects_missing_supplier(self):
        invoice = {
            "supplier": "",
            "amount": "1250",
            "date": "2026-11-05",
            "status": "Paid",
        }

        with self.assertRaises(ValueError):
            handler.validate_invoice_fields(invoice)

    def test_validate_invoice_fields_rejects_invalid_amount(self):
        invoice = {
            "supplier": "Kumasi Office Supplies",
            "amount": "-100",
            "date": "2026-11-05",
            "status": "Paid",
        }

        with self.assertRaises(ValueError):
            handler.validate_invoice_fields(invoice)

    def test_validate_invoice_fields_rejects_invalid_date(self):
        invoice = {
            "supplier": "Kumasi Office Supplies",
            "amount": "1250",
            "date": "05-11-2026",
            "status": "Paid",
        }

        with self.assertRaises(ValueError):
            handler.validate_invoice_fields(invoice)

    def test_validate_invoice_fields_rejects_invalid_status(self):
        invoice = {
            "supplier": "Kumasi Office Supplies",
            "amount": "1250",
            "date": "2026-11-05",
            "status": "Overdue",
        }

        with self.assertRaises(ValueError):
            handler.validate_invoice_fields(invoice)

    def test_partial_validation_accepts_one_updated_field(self):
        result = handler.validate_invoice_fields(
            {"status": "Pending"},
            partial=True,
        )

        self.assertEqual(
            result,
            {"status": "Pending"},
        )

    def test_parse_body_reads_json_request(self):
        event = {
            "body": json.dumps({
                "supplier": "Test Supplier"
            })
        }

        result = handler.parse_body(event)

        self.assertEqual(
            result["supplier"],
            "Test Supplier",
        )

    def test_parse_body_rejects_invalid_json(self):
        event = {
            "body": "{invalid json}"
        }

        with self.assertRaises(ValueError):
            handler.parse_body(event)

    def test_unknown_route_returns_404(self):
        event = {
            "requestContext": {
                "http": {
                    "method": "GET"
                }
            },
            "rawPath": "/unknown",
        }

        result = handler.lambda_handler(event, None)

        self.assertEqual(
            result["statusCode"],
            404,
        )

    def test_options_request_returns_204(self):
        event = {
            "requestContext": {
                "http": {
                    "method": "OPTIONS"
                }
            },
            "rawPath": "/invoices",
        }

        result = handler.lambda_handler(event, None)

        self.assertEqual(
            result["statusCode"],
            204,
        )

    @patch("handler.get_bucket", return_value="test-invoice-bucket")
    @patch("handler.s3.generate_presigned_post")
    def test_create_upload_url_returns_presigned_post(
        self,
        mock_presign,
        mock_bucket,
    ):
        mock_presign.return_value = {
            "url": "https://example.com/upload",
            "fields": {
                "key": "invoices/test-invoice.pdf",
                "Content-Type": "application/pdf",
            },
        }

        event = {
            "body": json.dumps({
                "fileName": "invoice.pdf",
                "contentType": "application/pdf",
                "fileSize": 1024,
            })
        }

        result = handler.create_upload_url(event)
        body = json.loads(result["body"])

        self.assertEqual(
            result["statusCode"],
            200,
        )

        self.assertEqual(
            body["uploadUrl"],
            "https://example.com/upload",
        )

        self.assertIn(
            "fields",
            body,
        )

        self.assertTrue(
            body["documentKey"].startswith("invoices/")
        )

        conditions = mock_presign.call_args.kwargs["Conditions"]

        self.assertIn(
            [
                "content-length-range",
                1,
                handler.MAX_FILE_SIZE,
            ],
            conditions,
        )

    def test_create_upload_url_rejects_unsupported_file_type(self):
        event = {
            "body": json.dumps({
                "fileName": "invoice.exe",
                "contentType": "application/octet-stream",
                "fileSize": 1024,
            })
        }

        with self.assertRaises(ValueError):
            handler.create_upload_url(event)

    def test_create_upload_url_rejects_mismatched_extension(self):
        event = {
            "body": json.dumps({
                "fileName": "invoice.pdf",
                "contentType": "image/png",
                "fileSize": 1024,
            })
        }

        with self.assertRaises(ValueError):
            handler.create_upload_url(event)

    def test_create_upload_url_rejects_oversized_file(self):
        event = {
            "body": json.dumps({
                "fileName": "invoice.pdf",
                "contentType": "application/pdf",
                "fileSize": handler.MAX_FILE_SIZE + 1,
            })
        }

        with self.assertRaises(ValueError):
            handler.create_upload_url(event)

    @patch("handler.get_table")
    @patch("handler.get_bucket", return_value="test-invoice-bucket")
    @patch("handler.s3.head_object")
    def test_create_invoice_saves_invoice(
        self,
        mock_head,
        mock_bucket,
        mock_get_table,
    ):
        mock_head.return_value = {
            "ContentLength": 1024,
            "ContentType": "application/pdf",
        }

        table = MagicMock()

        table.update_item.return_value = {
            "Attributes": {
                "invoiceSequence": Decimal("1")
            }
        }

        mock_get_table.return_value = table

        event = {
            "body": json.dumps({
                "supplier": "Kumasi Office Supplies",
                "amount": 1250,
                "date": "2026-11-05",
                "status": "Paid",
                "fileName": "invoice.pdf",
                "documentKey": (
                    "invoices/"
                    "123e4567-e89b-12d3-a456-426614174000"
                    "-invoice.pdf"
                ),
            })
        }

        result = handler.create_invoice(event)
        body = json.loads(result["body"])

        self.assertEqual(
            result["statusCode"],
            201,
        )

        self.assertEqual(
            body["invoice"]["id"],
            "INV-001",
        )

        self.assertEqual(
            body["invoice"]["supplier"],
            "Kumasi Office Supplies",
        )

        table.put_item.assert_called_once()

    @patch("handler.get_table")
    def test_list_invoices_returns_records(self, mock_get_table):
        table = MagicMock()

        table.scan.return_value = {
            "Items": [
                {
                    "id": "INV-001",
                    "supplier": "Kumasi Office Supplies",
                    "date": "2026-11-05",
                    "amount": Decimal("1250"),
                    "status": "Paid",
                }
            ]
        }

        mock_get_table.return_value = table

        result = handler.list_invoices({})
        body = json.loads(result["body"])

        self.assertEqual(
            result["statusCode"],
            200,
        )

        self.assertEqual(
            len(body["invoices"]),
            1,
        )

        self.assertEqual(
            body["invoices"][0]["id"],
            "INV-001",
        )

    @patch("handler.get_invoice")
    @patch("handler.get_bucket", return_value="test-invoice-bucket")
    @patch("handler.s3.generate_presigned_url")
    def test_get_download_url_returns_url(
        self,
        mock_presign,
        mock_bucket,
        mock_get_invoice,
    ):
        mock_get_invoice.return_value = {
            "id": "INV-001",
            "documentKey": "invoices/test-invoice.pdf",
        }

        mock_presign.return_value = (
            "https://example.com/download"
        )

        result = handler.get_download_url("INV-001")
        body = json.loads(result["body"])

        self.assertEqual(
            result["statusCode"],
            200,
        )

        self.assertEqual(
            body["downloadUrl"],
            "https://example.com/download",
        )

    @patch("handler.get_invoice")
    @patch("handler.get_table")
    def test_update_invoice_updates_status(
        self,
        mock_get_table,
        mock_get_invoice,
    ):
        mock_get_invoice.return_value = {
            "id": "INV-001"
        }

        table = MagicMock()

        table.update_item.return_value = {
            "Attributes": {
                "id": "INV-001",
                "status": "Pending",
            }
        }

        mock_get_table.return_value = table

        event = {
            "body": json.dumps({
                "status": "Pending"
            })
        }

        result = handler.update_invoice(
            "INV-001",
            event,
        )

        body = json.loads(result["body"])

        self.assertEqual(
            result["statusCode"],
            200,
        )

        self.assertEqual(
            body["invoice"]["status"],
            "Pending",
        )

        table.update_item.assert_called_once()

    @patch("handler.get_invoice")
    @patch("handler.get_table")
    @patch("handler.get_bucket", return_value="test-invoice-bucket")
    @patch("handler.s3.delete_object")
    def test_delete_invoice_removes_document_and_record(
        self,
        mock_s3_delete,
        mock_bucket,
        mock_get_table,
        mock_get_invoice,
    ):
        mock_get_invoice.return_value = {
            "id": "INV-001",
            "documentKey": "invoices/test-invoice.pdf",
        }

        table = MagicMock()
        mock_get_table.return_value = table

        result = handler.delete_invoice("INV-001")
        body = json.loads(result["body"])

        self.assertEqual(
            result["statusCode"],
            200,
        )

        self.assertIn(
            "successfully",
            body["message"],
        )

        mock_s3_delete.assert_called_once()
        table.delete_item.assert_called_once()

    @patch("handler.get_invoice", return_value=None)
    def test_get_missing_invoice_returns_404(self, mock_get_invoice):
        result = handler.get_single_invoice("INV-999")

        self.assertEqual(
            result["statusCode"],
            404,
        )

    @patch("handler.get_invoice", return_value=None)
    def test_delete_missing_invoice_returns_404(self, mock_get_invoice):
        result = handler.delete_invoice("INV-999")

        self.assertEqual(
            result["statusCode"],
            404,
        )


if __name__ == "__main__":
    unittest.main()
