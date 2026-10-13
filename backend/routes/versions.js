const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const MAX_VERSIONS = 50;

async function prepareVersionsSchema() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS document_versions (
                id SERIAL PRIMARY KEY,
                document_id VARCHAR(255) NOT NULL,
                title VARCHAR(255),
                content JSONB NOT NULL,
                label VARCHAR(100),
                created_by INTEGER,
                created_by_name VARCHAR(150),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_document_versions_doc
            ON document_versions (document_id, id DESC)
        `);

        console.log("✅ Historique des versions vérifié.");
    } catch (error) {
        console.error("❌ Erreur schéma versions :", error.message);
    }
}

async function getAccess(documentId, userId) {
    const result = await pool.query(
        `
        SELECT
            d.id,
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

function serverError(res, message, error) {
    console.error(message, error);
    res.status(500).json({ message, error: error.message });
}

/* Liste des versions (métadonnées uniquement) */
router.get("/documents/:id/versions", authMiddleware, async (req, res) => {
    try {
        const access = await getAccess(req.params.id, req.user.id);

        if (!access) {
            return res.status(403).json({ message: "Accès refusé." });
        }

        const result = await pool.query(
            `
            SELECT id, title, label, created_by_name, created_at
            FROM document_versions
            WHERE document_id = $1
            ORDER BY id DESC
            LIMIT $2
            `,
            [req.params.id, MAX_VERSIONS]
        );

        res.json(result.rows);
    } catch (error) {
        serverError(res, "Erreur récupération des versions.", error);
    }
});

/* Une version avec son contenu */
router.get(
    "/documents/:id/versions/:versionId",
    authMiddleware,
    async (req, res) => {
        try {
            const access = await getAccess(req.params.id, req.user.id);

            if (!access) {
                return res.status(403).json({ message: "Accès refusé." });
            }

            const versionId = Number(req.params.versionId);

            if (!Number.isInteger(versionId)) {
                return res.status(400).json({ message: "Version invalide." });
            }

            const result = await pool.query(
                `
                SELECT id, title, label, content, created_by_name, created_at
                FROM document_versions
                WHERE id = $1 AND document_id = $2
                `,
                [versionId, req.params.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Version introuvable." });
            }

            res.json(result.rows[0]);
        } catch (error) {
            serverError(res, "Erreur récupération de la version.", error);
        }
    }
);

/* Créer une version (ignorée si identique à la dernière) */
router.post("/documents/:id/versions", authMiddleware, async (req, res) => {
    try {
        const access = await getAccess(req.params.id, req.user.id);

        if (!access) {
            return res.status(403).json({ message: "Accès refusé." });
        }

        if (access.permission !== "owner" && access.permission !== "editor") {
            return res.status(403).json({
                message: "Vous n'avez pas le droit de modifier ce document."
            });
        }

        const { content, label } = req.body || {};

        if (!content || typeof content !== "object" || Array.isArray(content)) {
            return res.status(400).json({ message: "Contenu invalide." });
        }

        const json = JSON.stringify(content);

        if (json.length > 5 * 1024 * 1024) {
            return res.status(413).json({ message: "Contenu trop volumineux." });
        }

        const cleanLabel =
            typeof label === "string" && label.trim()
                ? label.trim().slice(0, 100)
                : null;

        const latest = await pool.query(
            `
            SELECT (content = $2::jsonb) AS same
            FROM document_versions
            WHERE document_id = $1
            ORDER BY id DESC
            LIMIT 1
            `,
            [req.params.id, json]
        );

        if (latest.rows.length > 0 && latest.rows[0].same && !cleanLabel) {
            return res.json({ skipped: true });
        }

        const title =
            typeof content.title === "string"
                ? content.title.trim().slice(0, 200)
                : null;

        const inserted = await pool.query(
            `
            INSERT INTO document_versions
                (document_id, title, content, label, created_by, created_by_name)
            VALUES ($1, $2, $3::jsonb, $4, $5, $6)
            RETURNING id, created_at
            `,
            [
                req.params.id,
                title,
                json,
                cleanLabel,
                req.user.id,
                req.user.name || null
            ]
        );

        await pool.query(
            `
            DELETE FROM document_versions
            WHERE document_id = $1
              AND id NOT IN (
                  SELECT id FROM document_versions
                  WHERE document_id = $1
                  ORDER BY id DESC
                  LIMIT $2
              )
            `,
            [req.params.id, MAX_VERSIONS]
        );

        res.status(201).json(inserted.rows[0]);
    } catch (error) {
        serverError(res, "Erreur création de version.", error);
    }
});

module.exports = { router, prepareVersionsSchema };