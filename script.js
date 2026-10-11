const API = "/api/expenses";
const STORAGE_KEY = "bytexl-expenses-v1";

const $ = (id) => document.getElementById(id);

const form = $("expenseForm");
const expenseId = $("expenseId");
const titleInput = $("title");
const amountInput = $("amount");
const categoryInput = $("category");
const dateInput = $("date");
const notesInput = $("notes");
const submitButton = $("submitButton");
const cancelButton = $("cancelButton");
const formHeading = $("formHeading");
const expenseList = $("expenseList");
const totalExpense = $("totalExpense");
const monthlyExpense = $("monthlyExpense");
const expenseCount = $("expenseCount");
const searchInput = $("searchInput");
const categoryFilter = $("categoryFilter");
const monthFilter = $("monthFilter");
const emptyMessage = $("emptyMessage");
const statusMessage = $("statusMessage");
const clearFilters = $("clearFilters");

let expenses = [];
let useLocalStorage = false;

const money = (value) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR"
    }).format(Number(value) || 0);

function today() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function showStatus(message) {
    statusMessage.textContent = message;
}

function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "The request failed.");
    }

    if (response.status === 204) return null;
    return response.json();
}

async function loadExpenses() {
    try {
        expenses = await apiRequest(API);
        useLocalStorage = false;
    } catch (error) {
        useLocalStorage = true;

        try {
            expenses = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        } catch {
            expenses = [];
        }

        showStatus("Server unavailable. Using this browser's local storage.");
    }

    renderExpenses();
}

async function createExpense(data) {
    if (useLocalStorage) {
        const item = { id: crypto.randomUUID(), ...data };
        expenses.push(item);
        saveLocal();
        return item;
    }

    return apiRequest(API, {
        method: "POST",
        body: JSON.stringify(data)
    });
}

async function updateExpense(id, data) {
    if (useLocalStorage) {
        expenses = expenses.map((item) =>
            String(item.id) === String(id) ? { ...item, ...data } : item
        );
        saveLocal();
        return;
    }

    return apiRequest(`${API}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(data)
    });
}

async function deleteExpense(id) {
    if (useLocalStorage) {
        expenses = expenses.filter(
            (item) => String(item.id) !== String(id)
        );
        saveLocal();
        return;
    }

    return apiRequest(`${API}/${encodeURIComponent(id)}`, {
        method: "DELETE"
    });
}

function getFilteredExpenses() {
    const search = searchInput.value.trim().toLowerCase();
    const category = categoryFilter.value;
    const month = monthFilter.value;

    return expenses
        .filter((item) => {
            const matchesSearch =
                `${item.title} ${item.notes || ""}`.toLowerCase().includes(search);
            const matchesCategory = !category || item.category === category;
            const matchesMonth = !month || item.date.startsWith(month);

            return matchesSearch && matchesCategory && matchesMonth;
        })
        .sort((a, b) => b.date.localeCompare(a.date));
}

function renderExpenses() {
    const filtered = getFilteredExpenses();
    const month = today().slice(0, 7);

    const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const monthly = expenses
        .filter((item) => item.date.startsWith(month))
        .reduce((sum, item) => sum + Number(item.amount), 0);

    totalExpense.textContent = money(total);
    monthlyExpense.textContent = money(monthly);
    expenseCount.textContent = String(expenses.length);

    expenseList.replaceChildren();

    for (const item of filtered) {
        const row = document.createElement("tr");

        function addCell(value, className = "") {
            const cell = document.createElement("td");
            cell.textContent = value ?? "";
            if (className) cell.className = className;
            row.appendChild(cell);
            return cell;
        }

        addCell(item.date);
        addCell(item.title);
        addCell(item.category);
        addCell(item.notes || "—");
        addCell(money(item.amount), "amount");

        const actionCell = addCell("");
        actionCell.className = "actions";

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "edit-button";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => startEdit(item.id));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "delete-button";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => removeExpense(item.id));

        actionCell.append(edit, remove);
        expenseList.appendChild(row);
    }

    emptyMessage.hidden = filtered.length > 0;
}

function resetForm() {
    form.reset();
    expenseId.value = "";
    dateInput.value = today();
    formHeading.textContent = "Add a New Expense";
    submitButton.textContent = "Add Expense";
    cancelButton.hidden = true;
}

function startEdit(id) {
    const item = expenses.find((expense) => String(expense.id) === String(id));
    if (!item) return;

    expenseId.value = item.id;
    titleInput.value = item.title;
    amountInput.value = item.amount;
    categoryInput.value = item.category;
    dateInput.value = item.date;
    notesInput.value = item.notes || "";

    formHeading.textContent = "Edit Expense";
    submitButton.textContent = "Save Changes";
    cancelButton.hidden = false;

    form.scrollIntoView({ behavior: "smooth", block: "start" });
    titleInput.focus();
}

async function removeExpense(id) {
    const item = expenses.find((expense) => String(expense.id) === String(id));
    if (!item) return;

    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;

    try {
        await deleteExpense(id);
        if (!useLocalStorage) {
            expenses = await apiRequest(API);
        }
        renderExpenses();
        showStatus("Expense deleted successfully.");
    } catch (error) {
        showStatus(error.message || "Could not delete the expense.");
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const data = {
        title: titleInput.value.trim(),
        amount: Number(amountInput.value),
        category: categoryInput.value,
        date: dateInput.value,
        notes: notesInput.value.trim()
    };

    if (!data.title || !data.category || !data.date ||
        !Number.isFinite(data.amount) || data.amount <= 0) {
        showStatus("Please enter a title, valid amount, category, and date.");
        return;
    }

    submitButton.disabled = true;

    try {
        if (expenseId.value) {
            await updateExpense(expenseId.value, data);
            showStatus("Expense updated successfully.");
        } else {
            await createExpense(data);
            showStatus("Expense added successfully.");
        }

        if (!useLocalStorage) {
            expenses = await apiRequest(API);
        }

        resetForm();
        renderExpenses();
    } catch (error) {
        showStatus(error.message || "Could not save the expense.");
    } finally {
        submitButton.disabled = false;
    }
});

cancelButton.addEventListener("click", resetForm);

searchInput.addEventListener("input", renderExpenses);
categoryFilter.addEventListener("change", renderExpenses);
monthFilter.addEventListener("change", renderExpenses);

clearFilters.addEventListener("click", () => {
    searchInput.value = "";
    categoryFilter.value = "";
    monthFilter.value = "";
    renderExpenses();
    showStatus("Filters cleared.");
});

dateInput.value = today();
loadExpenses();

