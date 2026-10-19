require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const Y = require("yjs");
const pool = require("./db");
const authMiddleware = require("./middleware/auth");
const organize = require("./routes/organize");
const versions = require("./routes/versions");
const registerRealtimeExtras = require("./realtime");
const createCollab = require("./routes/collab");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

app.use(
    cors({
        origin: "http://localhost:5173",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);

app.use(express.json({ limit: "10mb" }));

// Favoris, corbeille, renommage : doit rester AVANT les autres routes /api/documents
app.use("/api", organize.router);

// Historique des versions
app.use("/api", versions.router);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        allowedHeaders: ["Authorization"]
    }
});

// Notifications, mentions, partage avec notification.
// Doit rester AVANT les routes /api/documents ci-dessous : sa route de partage
// remplace l'ancienne.
const collab = createCollab(io);
app.use("/api", collab.router);

/* =========================================================
   JWT
========================================================= */

function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            name: user.name,
            email: user.email
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "7d"
        }
    );
}

/* =========================================================
   DATABASE PREPARATION
========================================================= */

async function prepareDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS yjs_state TEXT
        `);

        await pool.query(`
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS owner_id INTEGER
        `);

        await pool.query(`
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS document_permissions (
                id SERIAL PRIMARY KEY,
                document_id VARCHAR(255) NOT NULL,
                user_id INTEGER NOT NULL,
                permission VARCHAR(20) NOT NULL
                    CHECK (permission IN ('editor', 'viewer')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(document_id, user_id),
                CONSTRAINT fk_permission_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
        `);

        console.log("✅ Tables users / documents / permissions vérifiées.");
    } catch (error) {
        console.error("❌ Erreur préparation DB :", error.message);
    }
}

/* =========================================================
   BASIC ROUTES
========================================================= */

app.get("/", (req, res) => {
    res.json({ message: "API PlateformeCollaborative fonctionne !" });
});

app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT NOW()");
        res.json({
            success: true,
            message: "Backend + PostgreSQL fonctionnent !"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Erreur PostgreSQL.",
            error: error.message
        });
    }
});

/* =========================================================
   AUTHENTICATION
========================================================= */

app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Nom, email et mot de passe sont obligatoires."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Le mot de passe doit contenir au moins 6 caractères."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [normalizedEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                message: "Cet email est déjà utilisé."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `
            INSERT INTO users (name, email, password_hash)
            VALUES ($1, $2, $3)
            RETURNING id, name, email, created_at
            `,
            [name.trim(), normalizedEmail, passwordHash]
        );

        const user = result.rows[0];
        const token = generateToken(user);

        res.status(201).json({
            message: "Inscription réussie.",
            token,
            user
        });
    } catch (error) {
        console.error("Register error :", error);
        res.status(500).json({
            message: "Erreur lors de l'inscription.",
            error: error.message
        });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email et mot de passe sont obligatoires."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const result = await pool.query(
            `
            SELECT id, name, email, password_hash, created_at
            FROM users
            WHERE email = $1
            `,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Email ou mot de passe incorrect."
            });
        }

        const user = result.rows[0];

        const passwordCorrect = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordCorrect) {
            return res.status(401).json({
                message: "Email ou mot de passe incorrect."
            });
        }

        delete user.password_hash;

        const token = generateToken(user);

        res.json({
            message: "Connexion réussie.",
            token,
            user
        });
    } catch (error) {
        console.error("Login error :", error);
        res.status(500).json({
            message: "Erreur lors de la connexion.",
            error: error.message
        });
    }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT id, name, email, created_at
            FROM users
            WHERE id = $1
            `,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Utilisateur introuvable."
            });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        res.status(500).json({
            message: "Erreur utilisateur.",
            error: error.message
        });
    }
});

/* =========================================================
   DOCUMENT PERMISSION HELPERS
========================================================= */

async function getDocumentPermission(documentId, userId) {
    const result = await pool.query(
        `
        SELECT
            d.id,
            d.owner_id,
            CASE
                WHEN d.owner_id = $2 THEN 'owner'
                WHEN dp.permission IS NOT NULL THEN dp.permission
                ELSE NULL
            END AS permission
        FROM documents d
        LEFT JOIN document_permissions dp
            ON dp.document_id = d.id
            AND dp.user_id = $2
        WHERE d.id = $1
        `,
        [documentId, userId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    // Un document existant sans permission pour cet utilisateur = pas d'accès
    if (!result.rows[0].permission) {
        return null;
    }

    return result.rows[0];
}

async function requireDocumentAccess(documentId, userId) {
    return await getDocumentPermission(documentId, userId);
}

function canEdit(permission) {
    return permission === "owner" || permission === "editor";
}

/* =========================================================
   GET ONE DOCUMENT
   (la liste GET /api/documents est dans routes/organize.js)
========================================================= */

app.get("/api/documents/:id", authMiddleware, async (req, res) => {
    try {
        const permission = await requireDocumentAccess(
            req.params.id,
            req.user.id
        );

        if (!permission) {
            return res.status(403).json({
                message: "Vous n'avez pas accès à ce document."
            });
        }

        const result = await pool.query(
            `
            SELECT id, content, owner_id, created_at, updated_at
            FROM documents
            WHERE id = $1
            `,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Document introuvable."
            });
        }

        res.json({
            ...result.rows[0],
            permission: permission.permission
        });
    } catch (error) {
        res.status(500).json({
            message: "Erreur récupération document.",
            error: error.message
        });
    }
});

/* =========================================================
   CREATE DOCUMENT
========================================================= */

app.post("/api/documents", authMiddleware, async (req, res) => {
    try {
        const { id, content } = req.body;

        const documentId = id || `document-${Date.now()}`;

        const documentContent = content || {
            title: "Nouveau document",
            text: ""
        };

        const result = await pool.query(
            `
            INSERT INTO documents (id, content, owner_id)
            VALUES ($1, $2, $3)
            RETURNING id, content, owner_id, created_at, updated_at
            `,
            [documentId, documentContent, req.user.id]
        );

        res.status(201).json({
            ...result.rows[0],
            permission: "owner"
        });
    } catch (error) {
        console.error("CREATE document error:", error);
        res.status(500).json({
            message: "Erreur création document.",
            error: error.message
        });
    }
});

/* =========================================================
   UPDATE DOCUMENT (sauvegarde REST)
========================================================= */

app.put("/api/documents/:id", authMiddleware, async (req, res) => {
    try {
        const documentId = req.params.id;

        const permission = await requireDocumentAccess(
            documentId,
            req.user.id
        );

        if (!permission) {
            return res.status(403).json({ message: "Accès refusé." });
        }

        if (!canEdit(permission.permission)) {
            return res.status(403).json({
                message: "Vous avez uniquement le droit de lecture."
            });
        }

        const { content } = req.body;

        if (!content || typeof content !== "object") {
            return res.status(400).json({
                message: "Le contenu du document est obligatoire."
            });
        }

        const titleValue =
            typeof content.title === "string"
                ? content.title.trim().slice(0, 200)
                : null;

        const result = await pool.query(
            `
            UPDATE documents
            SET content = $1,
                title = $2,
                updated_at = NOW()
            WHERE id = $3
            RETURNING id, content, owner_id, created_at, updated_at
            `,
            [content, titleValue, documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Document introuvable."
            });
        }

        res.json({
            ...result.rows[0],
            permission: permission.permission
        });
    } catch (error) {
        console.error("UPDATE document error:", error);
        res.status(500).json({
            message: "Erreur modification document.",
            error: error.message
        });
    }
});

/* =========================================================
   DELETE DOCUMENT (suppression définitive directe)
   L'interface utilise plutôt la corbeille (routes/organize.js)
========================================================= */

app.delete("/api/documents/:id", authMiddleware, async (req, res) => {
    try {
        const permission = await requireDocumentAccess(
            req.params.id,
            req.user.id
        );

        if (!permission) {
            return res.status(403).json({ message: "Accès refusé." });
        }

        if (permission.permission !== "owner") {
            return res.status(403).json({
                message: "Seul le propriétaire peut supprimer le document."
            });
        }

        await pool.query(
            "DELETE FROM document_permissions WHERE document_id = $1",
            [req.params.id]
        );

        await pool.query(
            "DELETE FROM document_favorites WHERE document_id = $1",
            [req.params.id]
        );

        await pool.query(
            "DELETE FROM document_versions WHERE document_id = $1",
            [req.params.id]
        );

        await pool.query(
            "DELETE FROM notifications WHERE document_id = $1",
            [req.params.id]
        );

        const result = await pool.query(
            "DELETE FROM documents WHERE id = $1 RETURNING id",
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Document introuvable."
            });
        }

        yDocuments.delete(req.params.id);
        seedClaims.delete(req.params.id);

        res.json({
            message: "Document supprimé.",
            id: req.params.id
        });
    } catch (error) {
        console.error("DELETE document error:", error);
        res.status(500).json({
            message: "Erreur suppression document.",
            error: error.message
        });
    }
});

/* =========================================================
   SHARE DOCUMENT
   (POST /api/documents/:id/share est géré par routes/collab.js,
    avec notification. Cette ancienne version n'est plus utilisée.)
========================================================= */

app.post("/api/documents/:id/share", authMiddleware, async (req, res) => {
    try {
        const documentId = req.params.id;
        const { email, permission } = req.body;

        if (!email || !permission) {
            return res.status(400).json({
                message: "Email et permission sont obligatoires."
            });
        }

        if (permission !== "editor" && permission !== "viewer") {
            return res.status(400).json({
                message: "Permission invalide. Utilisez editor ou viewer."
            });
        }

        const documentPermission = await getDocumentPermission(
            documentId,
            req.user.id
        );

        if (!documentPermission) {
            return res.status(403).json({
                message: "Document inaccessible."
            });
        }

        if (documentPermission.permission !== "owner") {
            return res.status(403).json({
                message: "Seul le propriétaire peut partager le document."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const userResult = await pool.query(
            "SELECT id, name, email FROM users WHERE email = $1",
            [normalizedEmail]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                message: "Aucun utilisateur trouvé avec cet email."
            });
        }

        const sharedUser = userResult.rows[0];

        if (sharedUser.id === req.user.id) {
            return res.status(400).json({
                message: "Le propriétaire possède déjà tous les droits."
            });
        }

        await pool.query(
            `
            INSERT INTO document_permissions (document_id, user_id, permission)
            VALUES ($1, $2, $3)
            ON CONFLICT (document_id, user_id)
            DO UPDATE SET permission = EXCLUDED.permission
            `,
            [documentId, sharedUser.id, permission]
        );

        res.json({
            message: "Document partagé avec succès.",
            user: sharedUser,
            permission
        });
    } catch (error) {
        console.error("SHARE document error:", error);
        res.status(500).json({
            message: "Erreur lors du partage.",
            error: error.message
        });
    }
});

app.get("/api/documents/:id/shares", authMiddleware, async (req, res) => {
    try {
        const documentPermission = await getDocumentPermission(
            req.params.id,
            req.user.id
        );

        if (
            !documentPermission ||
            documentPermission.permission !== "owner"
        ) {
            return res.status(403).json({
                message: "Seul le propriétaire peut voir les partages."
            });
        }

        const result = await pool.query(
            `
            SELECT
                dp.id,
                dp.document_id,
                dp.permission,
                dp.created_at,
                u.id AS user_id,
                u.name,
                u.email
            FROM document_permissions dp
            INNER JOIN users u ON u.id = dp.user_id
            WHERE dp.document_id = $1
            ORDER BY dp.created_at DESC
            `,
            [req.params.id]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: "Erreur récupération des partages.",
            error: error.message
        });
    }
});

app.put(
    "/api/documents/:id/share/:userId",
    authMiddleware,
    async (req, res) => {
        try {
            const permission = await getDocumentPermission(
                req.params.id,
                req.user.id
            );

            if (!permission || permission.permission !== "owner") {
                return res.status(403).json({
                    message: "Seul le propriétaire peut modifier les permissions."
                });
            }

            const newPermission = req.body.permission;

            if (newPermission !== "editor" && newPermission !== "viewer") {
                return res.status(400).json({
                    message: "Permission invalide."
                });
            }

            const result = await pool.query(
                `
                UPDATE document_permissions
                SET permission = $1
                WHERE document_id = $2
                AND user_id = $3
                RETURNING *
                `,
                [newPermission, req.params.id, req.params.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Partage introuvable."
                });
            }

            res.json({
                message: "Permission modifiée.",
                share: result.rows[0]
            });
        } catch (error) {
            res.status(500).json({
                message: "Erreur modification permission.",
                error: error.message
            });
        }
    }
);

app.delete(
    "/api/documents/:id/share/:userId",
    authMiddleware,
    async (req, res) => {
        try {
            const permission = await getDocumentPermission(
                req.params.id,
                req.user.id
            );

            if (!permission || permission.permission !== "owner") {
                return res.status(403).json({
                    message: "Seul le propriétaire peut supprimer un partage."
                });
            }

            const result = await pool.query(
                `
                DELETE FROM document_permissions
                WHERE document_id = $1
                AND user_id = $2
                RETURNING *
                `,
                [req.params.id, req.params.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Partage introuvable."
                });
            }

            res.json({ message: "Accès utilisateur supprimé." });
        } catch (error) {
            res.status(500).json({
                message: "Erreur suppression partage.",
                error: error.message
            });
        }
    }
);

/* =========================================================
   YJS
========================================================= */

const YJS_FIELD = "default"; // champ utilisé par Tiptap Collaboration

const yDocuments = new Map();
const yDocumentLoading = new Map();
const yDocumentUsers = new Map();
const saveTimers = new Map();
const seedClaims = new Map(); // documentId -> socket.id autorisé à injecter le contenu REST

function getYjsRoom(documentId) {
    return `yjs-document-${documentId}`;
}

function encodeYjsUpdate(update) {
    return Buffer.from(update).toString("base64");
}

function decodeYjsUpdate(update) {
    if (typeof update !== "string" || update.length === 0) {
        throw new Error("Update Yjs invalide.");
    }
    return new Uint8Array(Buffer.from(update, "base64"));
}

function addYjsUser(documentId, socketId) {
    if (!yDocumentUsers.has(documentId)) {
        yDocumentUsers.set(documentId, new Set());
    }
    yDocumentUsers.get(documentId).add(socketId);
}

function removeYjsUser(documentId, socketId) {
    const users = yDocumentUsers.get(documentId);

    if (!users) {
        return 0;
    }

    users.delete(socketId);

    if (users.size === 0) {
        yDocumentUsers.delete(documentId);
        return 0;
    }

    return users.size;
}

function getYjsUserCount(documentId) {
    return yDocumentUsers.get(documentId)?.size || 0;
}

/*
 * Un document Yjs est "vide" s'il ne contient aucun texte
 * (uniquement des paragraphes vides ou rien du tout).
 */
function isYDocBlank(yDoc) {
    const fragment = yDoc.getXmlFragment(YJS_FIELD);

    if (fragment.length === 0) {
        return true;
    }

    const xml = fragment.toString();

    return xml.replace(/<\/?paragraph[^>]*>/g, "").trim() === "";
}

async function getYDocument(documentId) {
    if (yDocuments.has(documentId)) {
        return yDocuments.get(documentId);
    }

    if (yDocumentLoading.has(documentId)) {
        return yDocumentLoading.get(documentId);
    }

    const loadingPromise = (async () => {
        try {
            const yDoc = new Y.Doc();

            const result = await pool.query(
                "SELECT yjs_state FROM documents WHERE id = $1",
                [documentId]
            );

            if (result.rows.length > 0 && result.rows[0].yjs_state) {
                Y.applyUpdate(
                    yDoc,
                    new Uint8Array(
                        Buffer.from(result.rows[0].yjs_state, "base64")
                    )
                );
            }

            // On ne met en cache qu'un chargement réussi
            yDocuments.set(documentId, yDoc);

            return yDoc;
        } finally {
            yDocumentLoading.delete(documentId);
        }
    })();

    yDocumentLoading.set(documentId, loadingPromise);

    return loadingPromise;
}

async function persistYDocument(documentId) {
    const yDoc = yDocuments.get(documentId);

    if (!yDoc) {
        return;
    }

    try {
        const base64 = encodeYjsUpdate(Y.encodeStateAsUpdate(yDoc));

        await pool.query(
            `
            UPDATE documents
            SET yjs_state = $1,
                updated_at = NOW()
            WHERE id = $2
            `,
            [base64, documentId]
        );
    } catch (error) {
        console.error("Erreur sauvegarde Yjs :", error);
    }
}

function scheduleSave(documentId) {
    clearTimeout(saveTimers.get(documentId));

    saveTimers.set(
        documentId,
        setTimeout(() => {
            saveTimers.delete(documentId);
            persistYDocument(documentId);
        }, 800)
    );
}

async function flushSave(documentId) {
    const timer = saveTimers.get(documentId);

    if (timer) {
        clearTimeout(timer);
        saveTimers.delete(documentId);
    }

    await persistYDocument(documentId);
}

async function shutdown() {
    console.log("⏹️  Arrêt du serveur : sauvegarde des documents en attente...");

    for (const documentId of [...saveTimers.keys()]) {
        await flushSave(documentId);
    }

    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/* =========================================================
   SOCKET.IO AUTH
========================================================= */

io.use((socket, next) => {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Token JWT manquant."));
        }

        socket.user = jwt.verify(token, process.env.JWT_SECRET);

        next();
    } catch (error) {
        next(new Error("Token JWT invalide."));
    }
});

/* =========================================================
   SOCKET CONNECTION
========================================================= */

io.on("connection", (socket) => {
    console.log("🔌 Client connecté :", socket.id, "User:", socket.user.email);

    let currentDocumentId = null;

    /* ---------------------- YJS JOIN ---------------------- */

    socket.on("yjs-join", async ({ documentId } = {}) => {
        try {
            if (!documentId || typeof documentId !== "string") {
                return;
            }

            const access = await getDocumentPermission(
                documentId,
                socket.user.id
            );

            if (!access) {
                socket.emit("yjs-error", {
                    message: "Vous n'avez pas accès à ce document."
                });
                return;
            }

            const yDoc = await getYDocument(documentId);
            const room = getYjsRoom(documentId);

            await socket.join(room);

            currentDocumentId = documentId;

            addYjsUser(documentId, socket.id);

            const userCount = getYjsUserCount(documentId);

            io.to(room).emit("yjs-users", {
                documentId,
                count: userCount
            });

            socket.emit("yjs-sync", {
                documentId,
                update: encodeYjsUpdate(Y.encodeStateAsUpdate(yDoc)),
                hasState: !isYDocBlank(yDoc),
                permission: access.permission
            });

            console.log(`👥 Collaborateurs sur ${documentId} : ${userCount}`);
        } catch (error) {
            console.error("yjs-join error:", error);
            socket.emit("yjs-error", {
                message: "Impossible de rejoindre le document."
            });
        }
    });

    /* ------------------- DROIT D'INJECTION ------------------- */

    socket.on("yjs-claim-seed", async (payload, ack) => {
        const reply = (granted) => {
            if (typeof ack === "function") {
                ack({ granted });
            }
        };

        try {
            const documentId = payload?.documentId;

            if (!documentId || typeof documentId !== "string") {
                return reply(false);
            }

            const access = await getDocumentPermission(
                documentId,
                socket.user.id
            );

            if (!access || !canEdit(access.permission)) {
                return reply(false);
            }

            const yDoc = await getYDocument(documentId);

            if (!isYDocBlank(yDoc)) {
                return reply(false);
            }

            const owner = seedClaims.get(documentId);

            if (owner && owner !== socket.id) {
                return reply(false);
            }

            seedClaims.set(documentId, socket.id);

            reply(true);
        } catch (error) {
            console.error("yjs-claim-seed error:", error);
            reply(false);
        }
    });

    /* ---------------- YJS SYNC (reconnexion) ---------------- */

    socket.on("yjs-sync", async ({ documentId, update } = {}) => {
        try {
            if (!documentId || typeof documentId !== "string") {
                return;
            }

            const access = await getDocumentPermission(
                documentId,
                socket.user.id
            );

            if (!access || !canEdit(access.permission)) {
                return;
            }

            const yDoc = await getYDocument(documentId);

            Y.applyUpdate(yDoc, decodeYjsUpdate(update));

            socket.to(getYjsRoom(documentId)).emit("yjs-update", {
                documentId,
                update
            });

            scheduleSave(documentId);
        } catch (error) {
            console.error("yjs-sync error:", error);
        }
    });

    /* ------------------------ YJS UPDATE ------------------------ */

    socket.on("yjs-update", async ({ documentId, update } = {}) => {
        try {
            if (!documentId || typeof documentId !== "string") {
                return;
            }

            const access = await getDocumentPermission(
                documentId,
                socket.user.id
            );

            if (!access) {
                return;
            }

            if (!canEdit(access.permission)) {
                socket.emit("yjs-error", {
                    message: "Vous avez uniquement le droit de lecture."
                });
                return;
            }

            const yDoc = await getYDocument(documentId);

            Y.applyUpdate(yDoc, decodeYjsUpdate(update));

            socket.to(getYjsRoom(documentId)).emit("yjs-update", {
                documentId,
                update
            });

            scheduleSave(documentId);
        } catch (error) {
            console.error("yjs-update error:", error);
        }
    });

    /* ------------------------ DISCONNECT ------------------------ */

    socket.on("disconnect", async () => {
        console.log("🚪 Client déconnecté :", socket.id);

        if (!currentDocumentId) {
            return;
        }

        const documentId = currentDocumentId;

        try {
            // Libère le droit d'injection si le document est resté vide
            if (seedClaims.get(documentId) === socket.id) {
                const yDoc = yDocuments.get(documentId);

                if (!yDoc || isYDocBlank(yDoc)) {
                    seedClaims.delete(documentId);
                }
            }

            const remainingUsers = removeYjsUser(documentId, socket.id);

            io.to(getYjsRoom(documentId)).emit("yjs-users", {
                documentId,
                count: remainingUsers
            });

            console.log(`👥 Collaborateurs restants : ${remainingUsers}`);

            if (remainingUsers === 0) {
                await flushSave(documentId);

                // Libère la mémoire si personne n'est revenu entre-temps
                if (getYjsUserCount(documentId) === 0) {
                    yDocuments.delete(documentId);
                    seedClaims.delete(documentId);
                }
            }
        } catch (error) {
            console.error("disconnect error:", error);
        }
    });
});

/* =========================================================
   PRESENCE / CURSEURS (awareness) + salle personnelle
========================================================= */

registerRealtimeExtras(io, getDocumentPermission);

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
    await prepareDatabase();
    await organize.prepareOrganizeSchema();
    await versions.prepareVersionsSchema();
    await collab.prepareCollabSchema();

    server.listen(PORT, () => {
        console.log(`🚀 Serveur backend démarré sur http://localhost:${PORT}`);
    });
}

startServer();