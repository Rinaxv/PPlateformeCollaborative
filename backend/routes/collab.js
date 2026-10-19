const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

module.exports = function createCollab(io) {
    const router = express.Router();

    /* ---------------- SCHEMA ---------------- */

    async function prepareCollabSchema() {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS notifications (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    type VARCHAR(20) NOT NULL,
                    message TEXT NOT NULL,
                    document_id VARCHAR(255),
                    actor_name VARCHAR(150),
                    is_read BOOLEAN NOT NULL DEFAULT false,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_notifications_user
                ON notifications (user_id, is_read, created_at DESC)
            `);

            console.log("✅ Notifications vérifiées.");
        } catch (error) {
            console.error("❌ Erreur schéma notifications :", error.message);
        }
    }

    /* ---------------- OUTILS ---------------- */

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

    async function documentTitle(documentId) {
        const result = await pool.query(
            "SELECT content->>'title' AS title FROM documents WHERE id = $1",
            [documentId]
        );

        return result.rows[0]?.title || "Document sans titre";
    }

    async function notify(userId, { type, message, documentId, actorName }) {
        try {
            const result = await pool.query(
                `
                INSERT INTO notifications
                    (user_id, type, message, document_id, actor_name)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, type, message, document_id, actor_name,
                          is_read, created_at
                `,
                [userId, type, message, documentId || null, actorName || null]
            );

            io.to(`user-${userId}`).emit("notification", result.rows[0]);
        } catch (error) {
            console.error("Erreur notification :", error.message);
        }
    }

    function fail(res, message, error) {
        console.error(message, error);
        res.status(500).json({ message, error: error.message });
    }

    /* ---------------- PARTAGE (remplace l'ancienne route) ---------------- */

    router.post("/documents/:id/share", authMiddleware, async (req, res) => {
        try {
            const documentId = req.params.id;
            const { email, permission } = req.body || {};

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

            const access = await getAccess(documentId, req.user.id);

            if (!access) {
                return res.status(403).json({ message: "Document inaccessible." });
            }

            if (access.permission !== "owner") {
                return res.status(403).json({
                    message: "Seul le propriétaire peut partager le document."
                });
            }

            const userResult = await pool.query(
                "SELECT id, name, email FROM users WHERE email = $1",
                [String(email).trim().toLowerCase()]
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

            const title = await documentTitle(documentId);

            await notify(sharedUser.id, {
                type: "share",
                message: `${req.user.name || "Un utilisateur"} a partagé « ${title} » avec vous (${
                    permission === "editor" ? "Éditeur" : "Lecteur"
                }).`,
                documentId,
                actorName: req.user.name
            });

            res.json({
                message: "Document partagé avec succès.",
                user: sharedUser,
                permission
            });
        } catch (error) {
            fail(res, "Erreur lors du partage.", error);
        }
    });

    /* ---------------- PERSONNES AYANT ACCES (pour les mentions) ---------------- */

    router.get("/documents/:id/people", authMiddleware, async (req, res) => {
        try {
            const access = await getAccess(req.params.id, req.user.id);

            if (!access) {
                return res.status(403).json({ message: "Accès refusé." });
            }

            const result = await pool.query(
                `
                SELECT u.id, u.name, u.email, 'owner' AS permission
                FROM documents d
                JOIN users u ON u.id = d.owner_id
                WHERE d.id = $1
                UNION ALL
                SELECT u.id, u.name, u.email, dp.permission
                FROM document_permissions dp
                JOIN users u ON u.id = dp.user_id
                WHERE dp.document_id = $1
                `,
                [req.params.id]
            );

            res.json(result.rows);
        } catch (error) {
            fail(res, "Erreur récupération des personnes.", error);
        }
    });

    /* ---------------- MENTIONS ---------------- */

    router.post("/documents/:id/mentions", authMiddleware, async (req, res) => {
        try {
            const access = await getAccess(req.params.id, req.user.id);

            if (!access) {
                return res.status(403).json({ message: "Accès refusé." });
            }

            const ids = Array.isArray(req.body?.userIds)
                ? [...new Set(req.body.userIds.map(Number).filter(Number.isInteger))].slice(0, 10)
                : [];

            const title = await documentTitle(req.params.id);
            const notified = [];
            const noAccess = [];

            for (const userId of ids) {
                if (userId === req.user.id) continue;

                const targetAccess = await getAccess(req.params.id, userId);

                if (!targetAccess) {
                    noAccess.push(userId);
                    continue;
                }

                const recent = await pool.query(
                    `
                    SELECT 1 FROM notifications
                    WHERE user_id = $1 AND document_id = $2
                      AND type = 'mention' AND actor_name = $3
                      AND created_at > NOW() - INTERVAL '10 minutes'
                    LIMIT 1
                    `,
                    [userId, req.params.id, req.user.name || ""]
                );

                if (recent.rows.length > 0) continue;

                await notify(userId, {
                    type: "mention",
                    message: `${req.user.name || "Un utilisateur"} vous a mentionné dans « ${title} ».`,
                    documentId: req.params.id,
                    actorName: req.user.name
                });

                notified.push(userId);
            }

            res.json({ notified, noAccess });
        } catch (error) {
            fail(res, "Erreur lors de la mention.", error);
        }
    });

    /* ---------------- NOTIFICATIONS ---------------- */

    router.get("/notifications", authMiddleware, async (req, res) => {
        try {
            const items = await pool.query(
                `
                SELECT id, type, message, document_id, actor_name, is_read, created_at
                FROM notifications
                WHERE user_id = $1
                ORDER BY created_at DESC, id DESC
                LIMIT 50
                `,
                [req.user.id]
            );

            const unread = await pool.query(
                "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND is_read = false",
                [req.user.id]
            );

            res.json({ items: items.rows, unread: unread.rows[0].n });
        } catch (error) {
            fail(res, "Erreur récupération des notifications.", error);
        }
    });

    router.post("/notifications/read-all", authMiddleware, async (req, res) => {
        try {
            await pool.query(
                "UPDATE notifications SET is_read = true WHERE user_id = $1",
                [req.user.id]
            );

            res.json({ ok: true });
        } catch (error) {
            fail(res, "Erreur notifications.", error);
        }
    });

    router.post("/notifications/:id/read", authMiddleware, async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({ message: "Identifiant invalide." });
            }

            await pool.query(
                "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2",
                [id, req.user.id]
            );

            res.json({ ok: true });
        } catch (error) {
            fail(res, "Erreur notifications.", error);
        }
    });

    router.delete("/notifications", authMiddleware, async (req, res) => {
        try {
            await pool.query("DELETE FROM notifications WHERE user_id = $1", [
                req.user.id
            ]);

            res.json({ ok: true });
        } catch (error) {
            fail(res, "Erreur notifications.", error);
        }
    });

    return { router, prepareCollabSchema };
};