
const STORAGE_KEY = "cloudInvoiceManagerInvoices";

const sampleInvoices = [
    {
        id: "INV-001",
        supplier: "Kumasi Office Supplies",
        date: "2026-11-05",
        amount: 1250,
        status: "Paid",
        fileName: "office-supplies.pdf"
    },
    {
        id: "INV-002",
        supplier: "Accra Tech Solutions",
        date: "2026-11-08",
        amount: 3450,
        status: "Pending",
        fileName: "technology-invoice.pdf"
    },
    {
        id: "INV-003",
        supplier: "Golden Star Logistics",
        date: "2026-11-12",
        amount: 2100,
        status: "Paid",
        fileName: "logistics-invoice.pdf"
    },
    {
        id: "INV-004",
        supplier: "Modern Business Centre",
        date: "2026-11-15",
        amount: 875,
        status: "Pending",
        fileName: "business-centre.pdf"
    }
];

function loadInvoices() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (saved === null) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleInvoices));
            return [...sampleInvoices];
        }

        const parsed = JSON.parse(saved);

        if (!Array.isArray(parsed)) {
            throw new Error("Invalid saved invoice data.");
        }

        return parsed;
    } catch (error) {
        console.error("Could not load invoices:", error);
        return [...sampleInvoices];
    }
}

let invoices = loadInvoices();

let searchTerm = "";
let selectedStatus = "All";

function getFilteredInvoices() {
    return invoices.filter(invoice => {
        const matchesSearch =
            invoice.id.toLowerCase().includes(searchTerm) ||
            invoice.supplier.toLowerCase().includes(searchTerm);

        const matchesStatus =
            selectedStatus === "All" ||
            invoice.status === selectedStatus;

        return matchesSearch && matchesStatus;
    });
}

function saveInvoices() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
        return true;
    } catch (error) {
        console.error("Could not save invoices:", error);
        showMessage(
            "Unable to save. Check available browser storage.",
            "error"
        );
        return false;
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-GH", {
        style: "currency",
        currency: "GHS"
    }).format(amount);
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function renderDashboard() {
    const paid = invoices.filter(invoice => invoice.status === "Paid");
    const pending = invoices.filter(invoice => invoice.status === "Pending");

    const totalValue = invoices.reduce(
        (sum, invoice) => sum + Number(invoice.amount),
        0
    );

    document.getElementById("totalInvoices").textContent = invoices.length;
    document.getElementById("totalValue").textContent =
        formatCurrency(totalValue);
    document.getElementById("paidInvoices").textContent = paid.length;
    document.getElementById("pendingInvoices").textContent = pending.length;

    const table = document.getElementById("invoiceTable");
    const filteredInvoices = getFilteredInvoices();
    const invoiceCount = document.getElementById("invoiceCount");

    invoiceCount.textContent =
        `Showing ${filteredInvoices.length} of ${invoices.length} invoices`;

    table.innerHTML = filteredInvoices.map(invoice => `
        <tr>
            <td>${escapeHTML(invoice.id)}</td>
            <td>${escapeHTML(invoice.supplier)}</td>
            <td>${escapeHTML(invoice.date)}</td>
            <td>${formatCurrency(invoice.amount)}</td>
            <td>
                <span class="status ${invoice.status.toLowerCase()}">
                    ${escapeHTML(invoice.status)}
                </span>
            </td>
            <td>${escapeHTML(invoice.fileName)}</td>
            <td>
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
    `).join("");
}

function showMessage(message, type) {
    const messageElement = document.getElementById("formMessage");
    messageElement.textContent = message;
    messageElement.className = type;
}

function generateInvoiceId() {
    const highestNumber = invoices.reduce((highest, invoice) => {
        const match = invoice.id.match(/^INV-(\d+)$/);

        return match
            ? Math.max(highest, Number(match[1]))
            : highest;
    }, 0);

    return `INV-${String(highestNumber + 1).padStart(3, "0")}`;
}

// ADD NEW INVOICE

document.getElementById("invoiceForm").addEventListener("submit", event => {
    event.preventDefault();

    const fileInput = document.getElementById("invoiceFile");
    const file = fileInput.files[0];

    const supplier = document.getElementById("supplier").value.trim();
    const amount = Number(document.getElementById("amount").value);
    const date = document.getElementById("invoiceDate").value;
    const status = document.getElementById("status").value;

    const allowedTypes = [
        "application/pdf",
        "image/png",
        "image/jpeg"
    ];

    if (!file) {
        showMessage("Please select an invoice document.", "error");
        return;
    }

    if (!allowedTypes.includes(file.type)) {
        showMessage("Please select a PDF, PNG or JPG file.", "error");
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showMessage("The file must not exceed 5 MB.", "error");
        return;
    }

    if (
        !supplier ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 100000000 ||
        !date ||
        !["Paid", "Pending"].includes(status)
    ) {
        showMessage("Please enter valid invoice details.", "error");
        return;
    }

    const newInvoice = {
        id: generateInvoiceId(),
        supplier,
        date,
        amount,
        status,
        fileName: file.name
    };

    invoices.unshift(newInvoice);

    if (!saveInvoices()) {
        invoices.shift();
        return;
    }

    renderDashboard();
    event.target.reset();

    showMessage(
        `${newInvoice.id} has been added successfully. File contents have not been uploaded.`,
        "success"
    );
});

// OPEN ADD INVOICE FORM

document.getElementById("openFormButton").addEventListener("click", () => {
    document.getElementById("upload").scrollIntoView({
        behavior: "smooth"
    });

    document.getElementById("supplier").focus();
});

// SEARCH INVOICES

document.getElementById("searchInvoice").addEventListener("input", event => {
    searchTerm = event.target.value.trim().toLowerCase();
    renderDashboard();
});

// FILTER BY PAYMENT STATUS

document.getElementById("statusFilter").addEventListener("change", event => {
    selectedStatus = event.target.value;
    renderDashboard();
});

// CLEAR SEARCH AND FILTERS

document.getElementById("clearFilters").addEventListener("click", () => {
    document.getElementById("searchInvoice").value = "";
    document.getElementById("statusFilter").value = "All";

    searchTerm = "";
    selectedStatus = "All";

    renderDashboard();
});

// EDIT AND DELETE INVOICES

document.getElementById("invoiceTable").addEventListener("click", event => {

    // EDIT INVOICE

    const editButton = event.target.closest(".edit-invoice-button");

    if (editButton) {
        const invoiceId = editButton.dataset.invoiceId;

        const invoice = invoices.find(
            item => item.id === invoiceId
        );

        if (!invoice) {
            return;
        }

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

        const amount = Number(newAmount);
        const supplier = newSupplier.trim();
        const date = newDate.trim();
        const status = newStatus.trim();

        if (
            !supplier ||
            !Number.isFinite(amount) ||
            amount <= 0 ||
            amount > 100000000 ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !["Paid", "Pending"].includes(status)
        ) {
            showMessage(
                "Invalid details. Please check the supplier, amount, date and status.",
                "error"
            );
            return;
        }

        const oldInvoice = { ...invoice };

        invoice.supplier = supplier;
        invoice.amount = amount;
        invoice.date = date;
        invoice.status = status;

        if (!saveInvoices()) {
            Object.assign(invoice, oldInvoice);
            renderDashboard();
            return;
        }

        renderDashboard();

        showMessage(
            `${invoiceId} has been updated successfully.`,
            "success"
        );

        return;
    }

    // DELETE INVOICE

    const deleteButton = event.target.closest(".delete-invoice-button");

    if (!deleteButton) {
        return;
    }

    const invoiceId = deleteButton.dataset.invoiceId;

    const invoiceIndex = invoices.findIndex(
        invoice => invoice.id === invoiceId
    );

    if (invoiceIndex === -1) {
        return;
    }

    const confirmed = window.confirm(
        `Are you sure you want to delete ${invoiceId}?`
    );

    if (!confirmed) {
        return;
    }

    const [deletedInvoice] = invoices.splice(invoiceIndex, 1);

    if (!saveInvoices()) {
        invoices.splice(invoiceIndex, 0, deletedInvoice);
        renderDashboard();
        return;
    }

    renderDashboard();

    showMessage(
        `${invoiceId} has been deleted successfully.`,
        "success"
    );
});

// INITIAL DASHBOARD DISPLAY

renderDashboard();
