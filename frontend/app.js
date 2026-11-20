
/*
 * Cloud Invoice Manager
 * AWS-integrated frontend
 *
 * Services:
 * - API Gateway: HTTPS API
 * - Lambda: Backend processing
 * - DynamoDB: Invoice metadata
 * - S3: Invoice document storage
 */

// =====================================================
// 1. CONFIGURATION
// =====================================================

// Replace this placeholder with the actual API Gateway
// endpoint after the AWS infrastructure is deployed.

const API_BASE_URL = "https://giq979qtbl.execute-api.us-east-1.amazonaws.com";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_FILE_TYPES = {
    "application/pdf": [".pdf"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"]
};

// =====================================================
// 2. APPLICATION STATE
// =====================================================

let invoices = [];

let searchTerm = "";
let selectedStatus = "All";

let isLoading = false;

// =====================================================
// 3. API COMMUNICATION
// =====================================================

async function apiRequest(path, options = {}) {

    if (
        !API_BASE_URL ||
        API_BASE_URL === "REPLACE_WITH_API_GATEWAY_ENDPOINT"
    ) {
        throw new Error(
            "The AWS API endpoint has not been configured yet. " +
            "Your application is waiting for AWS deployment."
        );
    }

    const url = `${API_BASE_URL.replace(/\/$/, "")}${path}`;

    const headers = {
        ...(options.headers || {})
    };

    if (options.body && !(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    let result = {};

    try {
        result = await response.json();
    } catch {
        result = {};
    }

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            `Request failed with status ${response.status}.`
        );
    }

    return result;
}

// =====================================================
// 4. LOAD INVOICES FROM DYNAMODB THROUGH LAMBDA
// =====================================================

async function loadInvoices() {

    try {
        isLoading = true;
        renderDashboard();

        const result = await apiRequest("/invoices", {
            method: "GET"
        });

        if (Array.isArray(result)) {
            invoices = result;
        } else if (Array.isArray(result.invoices)) {
            invoices = result.invoices;
        } else if (
            result.data &&
            Array.isArray(result.data.invoices)
        ) {
            invoices = result.data.invoices;
        } else {
            throw new Error(
                "The API returned an unexpected invoice list."
            );
        }

        showMessage(
            "Invoices loaded successfully.",
            "success"
        );

    } catch (error) {

        console.error("Could not load invoices:", error);

        invoices = [];

        showMessage(
            error.message,
            "error"
        );

    } finally {

        isLoading = false;
        renderDashboard();
    }
}

// =====================================================
// 5. FORMAT CURRENCY
// =====================================================

function formatCurrency(amount) {

    return new Intl.NumberFormat("en-GH", {
        style: "currency",
        currency: "GHS"
    }).format(Number(amount) || 0);
}

// =====================================================
// 6. ESCAPE HTML
// =====================================================

function escapeHTML(value) {

    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// =====================================================
// 7. FILTER INVOICES
// =====================================================

function getFilteredInvoices() {

    return invoices.filter(invoice => {

        const id = String(invoice.id || "").toLowerCase();

        const supplier = String(
            invoice.supplier || ""
        ).toLowerCase();

        const matchesSearch =
            id.includes(searchTerm) ||
            supplier.includes(searchTerm);

        const matchesStatus =
            selectedStatus === "All" ||
            invoice.status === selectedStatus;

        return matchesSearch && matchesStatus;
    });
}

// =====================================================
// 8. DISPLAY DASHBOARD
// =====================================================

function renderDashboard() {

    const paid = invoices.filter(
        invoice => invoice.status === "Paid"
    );

    const pending = invoices.filter(
        invoice => invoice.status === "Pending"
    );

    const totalValue = invoices.reduce(
        (sum, invoice) => sum + Number(invoice.amount || 0),
        0
    );

    document.getElementById("totalInvoices").textContent =
        invoices.length;

    document.getElementById("totalValue").textContent =
        formatCurrency(totalValue);

    document.getElementById("paidInvoices").textContent =
        paid.length;

    document.getElementById("pendingInvoices").textContent =
        pending.length;

    const table = document.getElementById("invoiceTable");

    const filteredInvoices = getFilteredInvoices();

    document.getElementById("invoiceCount").textContent =
        `Showing ${filteredInvoices.length} of ${invoices.length} invoices`;

    if (isLoading) {

        table.innerHTML = `
            <tr>
                <td colspan="7">Loading invoices...</td>
            </tr>
        `;

        return;
    }

    if (filteredInvoices.length === 0) {

        table.innerHTML = `
            <tr>
                <td colspan="7">No invoices found.</td>
            </tr>
        `;

        return;
    }

    table.innerHTML = filteredInvoices.map(invoice => {

        const statusClass =
            invoice.status === "Paid" ? "paid" : "pending";

        return `
            <tr>
                <td>${escapeHTML(invoice.id)}</td>

                <td>${escapeHTML(invoice.supplier)}</td>

                <td>${escapeHTML(invoice.date)}</td>

                <td>${formatCurrency(invoice.amount)}</td>

                <td>
                    <span class="status ${statusClass}">
                        ${escapeHTML(invoice.status)}
                    </span>
                </td>

                <td>${escapeHTML(invoice.fileName)}</td>

                <td>
                    <button
                        type="button"
                        class="download-invoice-button"
                        data-invoice-id="${escapeHTML(invoice.id)}"
                    >
                        Download
                    </button>

                    <button
                        type="button"
                        class="edit-invoice-button"
                        data-invoice-id="${escapeHTML(invoice.id)}"
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        class="delete-invoice-button"
                        data-invoice-id="${escapeHTML(invoice.id)}"
                    >
                        Delete
                    </button>
                </td>
            </tr>
        `;

    }).join("");
}

// =====================================================
// 9. DISPLAY MESSAGES
// =====================================================

function showMessage(message, type) {

    const messageElement =
        document.getElementById("formMessage");

    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.className = type;
}

// =====================================================
// 10. VALIDATE INVOICE DETAILS
// =====================================================

function validateInvoiceDetails(
    supplier,
    amount,
    date,
    status
) {

    const validDate =
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        !Number.isNaN(Date.parse(`${date}T00:00:00`));

    if (!supplier) {
        return "Please enter the supplier name.";
    }

    if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 100000000
    ) {
        return "Please enter a valid invoice amount.";
    }

    if (!validDate) {
        return "Please enter a valid invoice date.";
    }

    if (!["Paid", "Pending"].includes(status)) {
        return "Please select a valid payment status.";
    }

    return null;
}

// =====================================================
// 11. VALIDATE DOCUMENT
// =====================================================

function validateFile(file) {

    if (!file) {
        return "Please select an invoice document.";
    }

    if (file.size > MAX_FILE_SIZE) {
        return "The document must not exceed 5 MB.";
    }

    const extension = "." +
        file.name.split(".").pop().toLowerCase();

    const allowedExtensions = Object.values(
        ALLOWED_FILE_TYPES
    ).flat();

    if (!allowedExtensions.includes(extension)) {
        return "Only PDF, PNG and JPG files are allowed.";
    }

    const allowedMimeTypes = Object.keys(ALLOWED_FILE_TYPES);

    if (
        file.type &&
        !allowedMimeTypes.includes(file.type)
    ) {
        return "The selected document has an unsupported file type.";
    }

    return null;
}

// =====================================================
// 12. REQUEST A PRESIGNED S3 UPLOAD URL
// =====================================================

async function requestUploadUrl(file) {

    const extension = "." +
        file.name.split(".").pop().toLowerCase();

    const contentType = file.type ||
        Object.keys(ALLOWED_FILE_TYPES).find(type =>
            ALLOWED_FILE_TYPES[type].includes(extension)
        );

    const result = await apiRequest(
        "/invoices/upload-url",
        {
            method: "POST",

            body: JSON.stringify({
                fileName: file.name,
                contentType,
                fileSize: file.size
            })
        }
    );

    if (
        !result.uploadUrl ||
        !result.fields ||
        !result.documentKey
    ) {
        throw new Error(
            "The upload URL response is incomplete."
        );
    }

    return result;
}

// =====================================================
// 13. UPLOAD DOCUMENT DIRECTLY TO S3
// =====================================================

async function uploadDocument(file, uploadDetails) {

    const formData = new FormData();

    Object.entries(uploadDetails.fields).forEach(
        ([key, value]) => {
            formData.append(key, value);
        }
    );

    // S3 requires the file field to be appended last.
    formData.append("file", file);

    const response = await fetch(
        uploadDetails.uploadUrl,
        {
            method: "POST",
            body: formData
        }
    );

    if (!response.ok) {

        throw new Error(
            `S3 document upload failed. HTTP status: ${response.status}`
        );
    }
}

// =====================================================
// 14. ADD NEW INVOICE
// =====================================================

document.getElementById("invoiceForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        if (isLoading) return;

        const form = event.target;

        const submitButton =
            form.querySelector('button[type="submit"]');

        const file =
            document.getElementById("invoiceFile").files[0];

        const supplier =
            document.getElementById("supplier").value.trim();

        const amount =
            Number(document.getElementById("amount").value);

        const date =
            document.getElementById("invoiceDate").value;

        const status =
            document.getElementById("status").value;

        const fileError = validateFile(file);

        if (fileError) {
            showMessage(fileError, "error");
            return;
        }

        const detailsError = validateInvoiceDetails(
            supplier,
            amount,
            date,
            status
        );

        if (detailsError) {
            showMessage(detailsError, "error");
            return;
        }

        try {

            isLoading = true;

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "Uploading...";
            }

            showMessage(
                "Requesting secure document upload...",
                "success"
            );

            // Step 1: Ask Lambda for a presigned S3 POST.

            const uploadDetails =
                await requestUploadUrl(file);

            // Step 2: Upload the actual document to S3.

            showMessage(
                "Uploading invoice document to S3...",
                "success"
            );

            await uploadDocument(file, uploadDetails);

            // Step 3: Save invoice metadata in DynamoDB.

            showMessage(
                "Saving invoice details...",
                "success"
            );

            await apiRequest("/invoices", {
                method: "POST",

                body: JSON.stringify({
                    supplier,
                    amount,
                    date,
                    status,
                    fileName: file.name,
                    documentKey: uploadDetails.documentKey
                })
            });

            form.reset();

            await loadInvoices();

            showMessage(
                "Invoice and document uploaded successfully.",
                "success"
            );

        } catch (error) {

            console.error("Invoice submission failed:", error);

            showMessage(
                error.message,
                "error"
            );

        } finally {

            isLoading = false;

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Add Invoice";
            }

            renderDashboard();
        }
    });

// =====================================================
// 15. OPEN ADD INVOICE FORM
// =====================================================

document.getElementById("openFormButton")
    .addEventListener("click", () => {

        document.getElementById("upload")
            .scrollIntoView({
                behavior: "smooth"
            });

        document.getElementById("supplier").focus();
    });

// =====================================================
// 16. SEARCH INVOICES
// =====================================================

document.getElementById("searchInvoice")
    .addEventListener("input", event => {

        searchTerm = event.target.value
            .trim()
            .toLowerCase();

        renderDashboard();
    });

// =====================================================
// 17. FILTER BY PAYMENT STATUS
// =====================================================

document.getElementById("statusFilter")
    .addEventListener("change", event => {

        selectedStatus = event.target.value;

        renderDashboard();
    });

// =====================================================
// 18. CLEAR SEARCH AND FILTERS
// =====================================================

document.getElementById("clearFilters")
    .addEventListener("click", () => {

        document.getElementById("searchInvoice").value = "";

        document.getElementById("statusFilter").value = "All";

        searchTerm = "";
        selectedStatus = "All";

        renderDashboard();
    });

// =====================================================
// 19. DOWNLOAD INVOICE DOCUMENT FROM S3
// =====================================================

async function downloadInvoice(invoiceId) {

    try {

        showMessage(
            `Preparing download for ${invoiceId}...`,
            "success"
        );

        const result = await apiRequest(
            `/invoices/${encodeURIComponent(invoiceId)}/download-url`,
            {
                method: "GET"
            }
        );

        const downloadUrl =
            result.downloadUrl || result.url;

        if (!downloadUrl) {
            throw new Error(
                "The API did not return a download URL."
            );
        }

        const link = document.createElement("a");

        link.href = downloadUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        document.body.appendChild(link);

        link.click();

        link.remove();

        showMessage(
            `${invoiceId} download link generated successfully.`,
            "success"
        );

    } catch (error) {

        console.error("Download failed:", error);

        showMessage(
            error.message,
            "error"
        );
    }
}

// =====================================================
// 20. EDIT INVOICE
// =====================================================

async function editInvoice(invoiceId) {

    const invoice = invoices.find(
        item => item.id === invoiceId
    );

    if (!invoice) return;

    const newSupplier = window.prompt(
        "Enter the supplier name:",
        invoice.supplier
    );

    if (newSupplier === null) return;

    const newAmount = window.prompt(
        "Enter the invoice amount:",
        invoice.amount
    );

    if (newAmount === null) return;

    const newDate = window.prompt(
        "Enter the invoice date (YYYY-MM-DD):",
        invoice.date
    );

    if (newDate === null) return;

    const newStatus = window.prompt(
        "Enter payment status: Paid or Pending",
        invoice.status
    );

    if (newStatus === null) return;

    const supplier = newSupplier.trim();
    const amount = Number(newAmount);
    const date = newDate.trim();
    const status = newStatus.trim();

    const validationError = validateInvoiceDetails(
        supplier,
        amount,
        date,
        status
    );

    if (validationError) {
        showMessage(validationError, "error");
        return;
    }

    try {

        await apiRequest(
            `/invoices/${encodeURIComponent(invoiceId)}`,
            {
                method: "PUT",

                body: JSON.stringify({
                    supplier,
                    amount,
                    date,
                    status
                })
            }
        );

        await loadInvoices();

        showMessage(
            `${invoiceId} has been updated successfully.`,
            "success"
        );

    } catch (error) {

        console.error("Invoice update failed:", error);

        showMessage(
            error.message,
            "error"
        );
    }
}

// =====================================================
// 21. DELETE INVOICE
// =====================================================

async function deleteInvoice(invoiceId) {

    const confirmed = window.confirm(
        `Are you sure you want to delete ${invoiceId}?`
    );

    if (!confirmed) return;

    try {

        await apiRequest(
            `/invoices/${encodeURIComponent(invoiceId)}`,
            {
                method: "DELETE"
            }
        );

        await loadInvoices();

        showMessage(
            `${invoiceId} has been deleted successfully.`,
            "success"
        );

    } catch (error) {

        console.error("Invoice deletion failed:", error);

        showMessage(
            error.message,
            "error"
        );
    }
}

// =====================================================
// 22. HANDLE TABLE ACTIONS
// =====================================================

document.getElementById("invoiceTable")
    .addEventListener("click", event => {

        const downloadButton =
            event.target.closest(".download-invoice-button");

        const editButton =
            event.target.closest(".edit-invoice-button");

        const deleteButton =
            event.target.closest(".delete-invoice-button");

        if (downloadButton) {

            downloadInvoice(
                downloadButton.dataset.invoiceId
            );

            return;
        }

        if (editButton) {

            editInvoice(
                editButton.dataset.invoiceId
            );

            return;
        }

        if (deleteButton) {

            deleteInvoice(
                deleteButton.dataset.invoiceId
            );
        }
    });

// =====================================================
// 23. INITIALISE APPLICATION
// =====================================================

renderDashboard();

// Load invoice records from AWS.

loadInvoices();
