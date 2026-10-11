
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3010;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "expenses.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

function readExpenses() {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function writeExpenses(expenses) {
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(expenses, null, 2), "utf8");
    fs.renameSync(tempFile, DATA_FILE);
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(data === null ? "" : JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        let size = 0;

        req.on("data", (chunk) => {
            size += chunk.length;

            if (size > 1024 * 1024) {
                reject(new Error("Request body is too large."));
                req.destroy();
                return;
            }

            body += chunk;
        });

        req.on("end", () => {
            try {
                resolve(JSON.parse(body || "{}"));
            } catch {
                reject(new Error("Invalid JSON request."));
            }
        });

        req.on("error", reject);
    });
}

function validateExpense(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return "Invalid expense data.";
    }

    if (typeof data.title !== "string" ||
        !data.title.trim() || data.title.trim().length > 100) {
        return "Title is required and must be at most 100 characters.";
    }

    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
        return "Enter a valid positive amount.";
    }

    const categories = [
        "Food", "Transport", "Shopping", "Education",
        "Bills", "Entertainment", "Health", "Other"
    ];

    if (!categories.includes(data.category)) {
        return "Choose a valid category.";
    }

    if (typeof data.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
        !Number.isFinite(Date.parse(`${data.date}T00:00:00Z`))) {
        return "Enter a valid date in YYYY-MM-DD format.";
    }

    if (data.notes !== undefined &&
        (typeof data.notes !== "string" || data.notes.length > 500)) {
        return "Notes must be at most 500 characters.";
    }

    return null;
}

function normalizeExpense(data, existing = {}) {
    return {
        id: existing.id || crypto.randomUUID(),
        title: data.title.trim(),
        amount: Number(data.amount),
        category: data.category,
        date: data.date,
        notes: (data.notes || "").trim()
    };
}

async function handleApi(req, res, pathname) {
    if (pathname === "/api/expenses" && req.method === "GET") {
        return sendJson(res, 200, readExpenses());
    }

    if (pathname === "/api/expenses" && req.method === "POST") {
        let data;

        try {
            data = await readBody(req);
        } catch (error) {
            return sendJson(res, 400, { error: error.message });
        }

        const problem = validateExpense(data);
        if (problem) return sendJson(res, 400, { error: problem });

        const expenses = readExpenses();
        const expense = normalizeExpense(data);
        expenses.push(expense);
        writeExpenses(expenses);

        return sendJson(res, 201, expense);
    }

    const match = pathname.match(/^\/api\/expenses\/([^/]+)$/);

    if (match) {
        const id = decodeURIComponent(match[1]);
        const expenses = readExpenses();
        const index = expenses.findIndex((item) => String(item.id) === id);

        if (index === -1) {
            return sendJson(res, 404, { error: "Expense not found." });
        }

        if (req.method === "PUT") {
            let data;

            try {
                data = await readBody(req);
            } catch (error) {
                return sendJson(res, 400, { error: error.message });
            }

            const problem = validateExpense(data);
            if (problem) return sendJson(res, 400, { error: problem });

            expenses[index] = normalizeExpense(data, expenses[index]);
            writeExpenses(expenses);
            return sendJson(res, 200, expenses[index]);
        }

        if (req.method === "DELETE") {
            expenses.splice(index, 1);
            writeExpenses(expenses);
            return sendJson(res, 204, null);
        }

        res.setHeader("Allow", "PUT, DELETE");
        return sendJson(res, 405, { error: "Method not allowed." });
    }

    return sendJson(res, 404, { error: "API endpoint not found." });
}

const server = http.createServer(async (req, res) => {
    let url;

    try {
        url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    } catch {
        return sendJson(res, 400, { error: "Invalid URL." });
    }

    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) {
        try {
            return await handleApi(req, res, pathname);
        } catch (error) {
            console.error("API error:", error);
            if (!res.headersSent) {
                return sendJson(res, 500, { error: "Internal server error." });
            }
            return res.end();
        }
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        return sendJson(res, 405, { error: "Method not allowed." });
    }

    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.resolve(ROOT, `.${requestedPath}`);

    if (!filePath.startsWith(ROOT + path.sep)) {
        return sendJson(res, 403, { error: "Access denied." });
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            return res.end("File not found.");
        }

        res.writeHead(200, {
            "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] ||
                "application/octet-stream",
            "X-Content-Type-Options": "nosniff"
        });

        res.end(req.method === "HEAD" ? undefined : content);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`ByteXL Expense Tracker running on http://localhost:${PORT}`);
});