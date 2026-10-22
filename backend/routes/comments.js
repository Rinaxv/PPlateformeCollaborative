const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const THREAD_RE = /^[\w-]{8,64}$/;

module.exports = function createComments(io) {
    const router = express.Router();

    async function prepareCommentsSchema() {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS document_comments (
                    id SERIAL PRIMARY KEY,
                    document_id VARCHAR(255) NOT NULL,
                    thread_id VARCHAR(64) NOT NULL,
                    is_root BOOLEAN NOT NULL DEFAULT false,
                    quote TEXT,
                    resolved BOOLEAN NOT NULL DEFAULT false,
                    author_id INTEGER,
                    author_name VARCHAR(150),
                    body TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_comments_doc
                ON document_comments (document_id, thread_id)
            `);

            console.log("✅ Commentaires vérifiés.");
        } catch (error) {
            console.error("❌ Erreur schéma commentaires :", error.message);
        }
    }

    async function getAccess(documentId, userId) {
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
                ON dp.document_id = d.id AND dp.user_id = $2
            WHERE d.id = $1
            `,
            [documentId, userId]
        );

        if (result.rows.length === 0 || !result.rows[0].permission) {
            return null;
        }

        return result.rows[0];
    }

    const canEdit = (permission) =>
        permission === "owner" || permission === "editor";

    async function documentTitle(documentId) {
        const result = await pool.query(
            "SELECT content->>'title' AS title FROM documents WHERE id = $1",
            [documentId]
        );

        return result.rows[0]?.title || "Document sans titre";
    }

    async function notify(userId, message, documentId, actorName) {
        try {
            const result = await pool.query(
                `
                INSERT INTO notifications
                    (user_id, type, message, document_id, actor_name)
                VALUES ($1, 'comment', $2, $3, $4)
                RETURNING id, type, message, document_id, actor_name,
                          is_read, created_at
                `,
                [userId, message, documentId, actorName || null]
            );

            io.to(`user-${userId}`).emit("notification", result.rows[0]);
        } catch (error) {
            console.error("Erreur notification commentaire :", error.message);
        }
    }

    const announce = (documentId) =>
        io
            .to(`yjs-document-${documentId}`)
            .emit("comments-changed", { documentId });

    function fail(res, message, error) {
        console.error(message, error);
        res.status(500).json({ message, error: error.message });
    }

    /* ---------------- LISTE ---------------- */

    router.get("/documents/:id/comments", authMiddleware, async (req, res) => {
        try {
            const access = await getAccess(req.params.id, req.user.id);

            if (!access) {
                return res.status(403).json({ message: "Accès refusé." });
            }

            const result = await pool.query(
                `
                SELECT id, thread_id, is_root, quote, resolved,
                       author_id, author_name, body, created_at
                FROM document_comments
                WHERE document_id = $1
                ORDER BY created_at ASC, id ASC
                `,
                [req.params.id]
            );

            res.json(result.rows);
        } catch (error) {
            fail(res, "Erreur récupération des commentaires.", error);
        }
    });

    /* ---------------- AJOUT (nouveau fil ou réponse) ---------------- */

    router.post("/documents/:id/comments", authMiddleware, async (req, res) => {
        try {
            const documentId = req.params.id;
            const access = await getAccess(documentId, req.user.id);

            if (!access) {
                return res.status(403).json({ message: "Accès refusé." });
            }

            if (!canEdit(access.permission)) {
                return res.status(403).json({
                    message: "Vous n'avez pas le droit de commenter ce document."
                });
            }

            const body = String(req.body?.body || "").trim().slice(0, 2000);
            const threadId = String(req.body?.threadId || "");

            if (!body) {
                return res.status(400).json({
                    message: "Le commentaire ne peut pas être vide."
                });
            }

            if (!THREAD_RE.test(threadId)) {
                return res.status(400).json({ message: "Fil invalide." });
            }

            const existing = await pool.query(
                `
                SELECT 1 FROM document_comments
                WHERE document_id = $1 AND thread_id = $2
                LIMIT 1
                `,
                [documentId, threadId]
            );

            const isRoot = existing.rows.length === 0;
            const quote = isRoot
                ? String(req.body?.quote || "").slice(0, 300)
                : null;

            const inserted = await pool.query(
                `
                INSERT INTO document_comments
                    (document_id, thread_id, is_root, quote,
                     author_id, author_name, body)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id, thread_id, is_root, quote, resolved,
                          author_id, author_name, body, created_at
                `,
                [
                    documentId,
                    threadId,
                    isRoot,
                    quote,
                    req.user.id,
                    req.user.name || null,
                    body
                ]
            );

            const targets = new Set();

            if (access.owner_id) targets.add(access.owner_id);

            const participants = await pool.query(
                `
                SELECT DISTINCT author_id FROM document_comments
                WHERE document_id = $1 AND thread_id = $2
                `,
                [documentId, threadId]
            );

            participants.rows.forEach((row) => {
                if (row.author_id) targets.add(row.author_id);
            });

            targets.delete(req.user.id);

            if (targets.size > 0) {
                const title = await documentTitle(documentId);
                const name = req.user.name || "Un utilisateur";

                const message = isRoot
                    ? `${name} a commenté « ${title} ».`
                    : `${name} a répondu à un commentaire dans « ${title} ».`;

                for (const userId of targets) {
                    await notify(userId, message, documentId, req.user.name);
                }
            }

            announce(documentId);

            res.status(201).json(inserted.rows[0]);
        } catch (error) {
            fail(res, "Erreur lors de l'ajout du commentaire.", error);
        }
    });

    /* ---------------- RESOUDRE / ROUVRIR ---------------- */

    router.put(
        "/documents/:id/comments/threads/:threadId/resolve",
        authMiddleware,
        async (req, res) => {
            try {
                const access = await getAccess(req.params.id, req.user.id);

                if (!access || !canEdit(access.permission)) {
                    return res.status(403).json({ message: "Accès refusé." });
                }

                if (!THREAD_RE.test(req.params.threadId)) {
                    return res.status(400).json({ message: "Fil invalide." });
                }

                const result = await pool.query(
                    `
                    UPDATE document_comments
                    SET resolved = $1
                    WHERE document_id = $2 AND thread_id = $3 AND is_root = true
                    RETURNING id
                    `,
                    [req.body?.resolved === true, req.params.id, req.params.threadId]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({ message: "Fil introuvable." });
                }

                announce(req.params.id);

                res.json({ ok: true });
            } catch (error) {
                fail(res, "Erreur lors de la résolution.", error);
            }
        }
    );

    /* ---------------- SUPPRESSION ---------------- */

    router.delete(
        "/documents/:id/comments/:commentId",
        authMiddleware,
        async (req, res) => {
            try {
                const access = await getAccess(req.params.id, req.user.id);

                if (!access || !canEdit(access.permission)) {
                    return res.status(403).json({ message: "Accès refusé." });
                }

                const commentId = Number(req.params.commentId);

                if (!Number.isInteger(commentId)) {
                    return res.status(400).json({ message: "Commentaire invalide." });
                }

                const found = await pool.query(
                    `
                    SELECT id, thread_id, is_root, author_id
                    FROM document_comments
                    WHERE id = $1 AND document_id = $2
                    `,
                    [commentId, req.params.id]
                );

                if (found.rows.length === 0) {
                    return res.status(404).json({ message: "Commentaire introuvable." });
                }

                const comment = found.rows[0];

                if (
                    comment.author_id !== req.user.id &&
                    access.permission !== "owner"
                ) {
                    return res.status(403).json({
                        message:
                            "Seul l'auteur ou le propriétaire peut supprimer ce commentaire."
                    });
                }

                if (comment.is_root) {
                    await pool.query(
                        `
                        DELETE FROM document_comments
                        WHERE document_id = $1 AND thread_id = $2
                        `,
                        [req.params.id, comment.thread_id]
                    );
                } else {
                    await pool.query(
                        "DELETE FROM document_comments WHERE id = $1",
                        [commentId]
                    );
                }

                announce(req.params.id);

                res.json({
                    threadDeleted: comment.is_root,
                    threadId: comment.thread_id
                });
            } catch (error) {
                fail(res, "Erreur lors de la suppression.", error);
            }
        }
    );

    return { router, prepareCommentsSchema };
};