const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

/* =========================================================
   SCHEMA (ajouts uniquement, rien n'est supprimé)
========================================================= */

async function prepareOrganizeSchema() {
    try {
        await pool.query(`
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS document_favorites (
                user_id INTEGER NOT NULL,
                document_id VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, document_id)
            )
        `);

        console.log("✅ Favoris / corbeille vérifiés.");
    } catch (error) {
        console.error("❌ Erreur schéma favoris/corbeille :", error.message);
    }
}

/* =========================================================
   OUTILS
========================================================= */

async function getAccess(documentId, userId) {
    const result = await pool.query(
        `
        SELECT
            d.id,
            d.owner_id,
            d.deleted_at,
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

    if (result.rows.length === 0 || !result.rows[0].permission) {
        return null;
    }

    return result.rows[0];
}

function serverError(res, message, error) {
    console.error(message, error);
    res.status(500).json({ message, error: error.message });
}

/* =========================================================
   LISTE DES DOCUMENTS ACTIFS (remplace l'ancienne route)
========================================================= */

router.get("/documents", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                d.id,
                d.content,
                d.owner_id,
                d.created_at,
                d.updated_at,
                CASE
                    WHEN d.owner_id = $1 THEN 'owner'
                    WHEN dp.permission IS NOT NULL THEN dp.permission
                    ELSE NULL
                END AS permission,
                (f.user_id IS NOT NULL) AS is_favorite
            FROM documents d
            LEFT JOIN document_permissions dp
                ON dp.document_id = d.id
                AND dp.user_id = $1
            LEFT JOIN document_favorites f
                ON f.document_id = d.id
                AND f.user_id = $1
            WHERE (d.owner_id = $1 OR dp.user_id = $1)
              AND d.deleted_at IS NULL
            ORDER BY COALESCE(d.updated_at, d.created_at) DESC
            `,
            [req.user.id]
        );

        res.json(result.rows);
    } catch (error) {
        serverError(res, "Erreur récupération documents.", error);
    }
});

/* =========================================================
   CORBEILLE (documents supprimés dont je suis propriétaire)
========================================================= */

router.get("/documents/trash", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                d.id,
                d.content,
                d.owner_id,
                d.created_at,
                d.updated_at,
                d.deleted_at,
                'owner' AS permission,
                false AS is_favorite
            FROM documents d
            WHERE d.owner_id = $1
              AND d.deleted_at IS NOT NULL
            ORDER BY d.deleted_at DESC
            `,
            [req.user.id]
        );

        res.json(result.rows);
    } catch (error) {
        serverError(res, "Erreur récupération corbeille.", error);
    }
});

/* =========================================================
   FAVORIS (propres à chaque utilisateur)
========================================================= */

router.post("/documents/:id/favorite", authMiddleware, async (req, res) => {
    try {
        const access = await getAccess(req.params.id, req.user.id);

        if (!access) {
            return res.status(403).json({ message: "Accès refusé." });
        }

        const favorite = req.body?.favorite === true;

        if (favorite) {
            await pool.query(
                `
                INSERT INTO document_favorites (user_id, document_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                `,
                [req.user.id, req.params.id]
            );
        } else {
            await pool.query(
                `
                DELETE FROM document_favorites
                WHERE user_id = $1 AND document_id = $2
                `,
                [req.user.id, req.params.id]
            );
        }

        res.json({ id: req.params.id, is_favorite: favorite });
    } catch (error) {
        serverError(res, "Erreur favori.", error);
    }
});

/* =========================================================
   RENOMMER
========================================================= */

router.put("/documents/:id/rename", authMiddleware, async (req, res) => {
    try {
        const access = await getAccess(req.params.id, req.user.id);

        if (!access) {
            return res.status(403).json({ message: "Accès refusé." });
        }

        if (access.permission !== "owner" && access.permission !== "editor") {
            return res.status(403).json({
                message: "Vous n'avez pas le droit de renommer ce document."
            });
        }

        const title =
            typeof req.body?.title === "string"
                ? req.body.title.trim().slice(0, 200)
                : "";

        if (!title) {
            return res.status(400).json({
                message: "Le titre ne peut pas être vide."
            });
        }

        const result = await pool.query(
            `
            UPDATE documents
            SET content = jsonb_set(
                    COALESCE(content, '{}'::jsonb),
                    '{title}',
                    to_jsonb($1::text)
                ),
                title = $1,
                updated_at = NOW()
            WHERE id = $2
            RETURNING id, content, updated_at
            `,
            [title, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Document introuvable." });
        }

        res.json(result.rows[0]);
    } catch (error) {
        serverError(res, "Erreur renommage.", error);
    }
});

/* =========================================================
   METTRE A LA CORBEILLE / RESTAURER (propriétaire)
========================================================= */

router.post("/documents/:id/trash", authMiddleware, async (req, res) => {
    try {
        const access = await getAccess(req.params.id, req.user.id);

        if (!access) {
            return res.status(403).json({ message: "Accès refusé." });
        }

        if (access.permission !== "owner") {
            return res.status(403).json({
                message: "Seul le propriétaire peut supprimer le document."
            });
        }

        const result = await pool.query(
            `
            UPDATE documents
            SET deleted_at = NOW()
            WHERE id = $1
            RETURNING id, deleted_at
            `,
            [req.params.id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        serverError(res, "Erreur mise à la corbeille.", error);
    }
});

router.post("/documents/:id/restore", authMiddleware, async (req, res) => {
    try {
        const access = await getAccess(req.params.id, req.user.id);

        if (!access || access.permission !== "owner") {
            return res.status(403).json({
                message: "Seul le propriétaire peut restaurer le document."
            });
        }

        const result = await pool.query(
            `
            UPDATE documents
            SET deleted_at = NULL,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id
            `,
            [req.params.id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        serverError(res, "Erreur restauration.", error);
    }
});

/* =========================================================
   SUPPRESSION DEFINITIVE (uniquement depuis la corbeille)
========================================================= */

router.delete("/documents/:id/permanent", authMiddleware, async (req, res) => {
    try {
        const access = await getAccess(req.params.id, req.user.id);

        if (!access || access.permission !== "owner") {
            return res.status(403).json({
                message: "Seul le propriétaire peut supprimer définitivement."
            });
        }

        if (!access.deleted_at) {
            return res.status(400).json({
                message: "Mettez d'abord le document à la corbeille."
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

        await pool.query("DELETE FROM documents WHERE id = $1", [
            req.params.id
        ]);

        res.json({ message: "Document supprimé définitivement.", id: req.params.id });
    } catch (error) {
        serverError(res, "Erreur suppression définitive.", error);
    }
});

module.exports = { router, prepareOrganizeSchema };