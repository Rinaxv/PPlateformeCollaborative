const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth");

const MAX_BODY = 2000;

module.exports = function createMessages(io) {
    const router = express.Router();
    const sendLog = new Map();

    /* ---------------- SCHEMA ---------------- */

    async function prepareMessagesSchema() {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id SERIAL PRIMARY KEY,
                    channel VARCHAR(300) NOT NULL,
                    sender_id INTEGER NOT NULL,
                    sender_name VARCHAR(150),
                    body TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_messages_channel
                ON chat_messages (channel, id DESC)
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_reads (
                    user_id INTEGER NOT NULL,
                    channel VARCHAR(300) NOT NULL,
                    last_read_id INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (user_id, channel)
                )
            `);

            console.log("✅ Messagerie vérifiée.");
        } catch (error) {
            console.error("❌ Erreur schéma messagerie :", error.message);
        }
    }

    /* ---------------- CANAUX ---------------- */

    // Conversation privée : dm:<petit id>:<grand id>
    // Discussion de document : doc:<id du document>
    function dmChannel(a, b) {
        const [x, y] = [Number(a), Number(b)].sort((p, q) => p - q);
        return `dm:${x}:${y}`;
    }

    function parseChannel(channel) {
        if (typeof channel !== "string") return null;

        const dm = /^dm:(\d+):(\d+)$/.exec(channel);

        if (dm) {
            const a = Number(dm[1]);
            const b = Number(dm[2]);

            if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a >= b) {
                return null;
            }

            return { type: "dm", a, b };
        }

        const doc = /^doc:(.{1,255})$/.exec(channel);

        if (doc) {
            return { type: "doc", documentId: doc[1] };
        }

        return null;
    }

    // Deux personnes sont "connectées" si elles partagent au moins un document
    async function connected(a, b) {
        const result = await pool.query(
            `
            SELECT 1
            FROM documents d
            LEFT JOIN document_permissions pa
                ON pa.document_id = d.id AND pa.user_id = $1
            LEFT JOIN document_permissions pb
                ON pb.document_id = d.id AND pb.user_id = $2
            WHERE (d.owner_id = $1 OR pa.user_id IS NOT NULL)
              AND (d.owner_id = $2 OR pb.user_id IS NOT NULL)
              AND d.deleted_at IS NULL
            LIMIT 1
            `,
            [a, b]
        );

        return result.rows.length > 0;
    }

    async function documentMembers(documentId, userId) {
        const result = await pool.query(
            `
            SELECT d.owner_id, dp.user_id AS perm_user
            FROM documents d
            LEFT JOIN document_permissions dp ON dp.document_id = d.id
            WHERE d.id = $1
            `,
            [documentId]
        );

        if (result.rows.length === 0) return null;

        const ids = new Set();

        if (result.rows[0].owner_id) ids.add(result.rows[0].owner_id);

        result.rows.forEach((row) => {
            if (row.perm_user) ids.add(row.perm_user);
        });

        return ids.has(userId) ? [...ids] : null;
    }

    // Renvoie les membres du canal, ou null si l'utilisateur n'y a pas droit
    async function resolveMembers(channel, userId) {
        const parsed = parseChannel(channel);

        if (!parsed) return null;

        if (parsed.type === "dm") {
            if (userId !== parsed.a && userId !== parsed.b) return null;

            const other = userId === parsed.a ? parsed.b : parsed.a;

            return (await connected(userId, other)) ? [parsed.a, parsed.b] : null;
        }

        return documentMembers(parsed.documentId, userId);
    }

    const emitTo = (members, event, payload) =>
        members.forEach((id) => io.to(`user-${id}`).emit(event, payload));

    function allowSend(userId) {
        const now = Date.now();
        const recent = (sendLog.get(userId) || []).filter((t) => now - t < 10000);

        if (recent.length >= 15) {
            sendLog.set(userId, recent);
            return false;
        }

        recent.push(now);
        sendLog.set(userId, recent);

        return true;
    }

    async function saveRead(userId, channel, lastReadId) {
        await pool.query(
            `
            INSERT INTO chat_reads (user_id, channel, last_read_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, channel)
            DO UPDATE SET last_read_id =
                GREATEST(chat_reads.last_read_id, EXCLUDED.last_read_id)
            `,
            [userId, channel, lastReadId]
        );
    }

    function fail(res, message, error) {
        console.error(message, error);
        res.status(500).json({ message, error: error.message });
    }

    /* ---------------- LISTE DES CONVERSATIONS ---------------- */

    router.get("/chat/conversations", authMiddleware, async (req, res) => {
        try {
            const me = Number(req.user.id);
            const currentDoc = String(req.query.doc || "");

            const contacts = await pool.query(
                `
                SELECT DISTINCT u.id, u.name, u.email
                FROM users u
                JOIN (
                    SELECT d.owner_id AS uid, d.id AS did
                    FROM documents d
                    WHERE d.owner_id IS NOT NULL AND d.deleted_at IS NULL
                    UNION
                    SELECT dp.user_id AS uid, dp.document_id AS did
                    FROM document_permissions dp
                    JOIN documents d ON d.id = dp.document_id
                    WHERE d.deleted_at IS NULL
                ) m ON m.uid = u.id
                WHERE u.id <> $1
                  AND m.did IN (
                      SELECT d.id FROM documents d
                      WHERE d.owner_id = $1 AND d.deleted_at IS NULL
                      UNION
                      SELECT dp.document_id
                      FROM document_permissions dp
                      JOIN documents d ON d.id = dp.document_id
                      WHERE dp.user_id = $1 AND d.deleted_at IS NULL
                  )
                ORDER BY u.name
                `,
                [me]
            );

            const docs = await pool.query(
                `
                SELECT d.id, d.content->>'title' AS title
                FROM documents d
                LEFT JOIN document_permissions dp
                    ON dp.document_id = d.id AND dp.user_id = $1
                WHERE (d.owner_id = $1 OR dp.user_id = $1)
                  AND d.deleted_at IS NULL
                `,
                [me]
            );

            const dmChannels = contacts.rows.map((c) => dmChannel(me, c.id));
            const docChannels = docs.rows.map((d) => `doc:${d.id}`);
            const channels = [...dmChannels, ...docChannels];

            const lastMap = new Map();
            const unreadMap = new Map();

            if (channels.length > 0) {
                const last = await pool.query(
                    `
                    SELECT DISTINCT ON (channel)
                        channel, body, sender_id, created_at
                    FROM chat_messages
                    WHERE channel = ANY($1::text[])
                    ORDER BY channel, id DESC
                    `,
                    [channels]
                );

                last.rows.forEach((row) => lastMap.set(row.channel, row));

                const unread = await pool.query(
                    `
                    SELECT m.channel, COUNT(*)::int AS n
                    FROM chat_messages m
                    LEFT JOIN chat_reads r
                        ON r.user_id = $2 AND r.channel = m.channel
                    WHERE m.channel = ANY($1::text[])
                      AND m.sender_id <> $2
                      AND m.id > COALESCE(r.last_read_id, 0)
                    GROUP BY m.channel
                    `,
                    [channels, me]
                );

                unread.rows.forEach((row) => unreadMap.set(row.channel, row.n));
            }

            const lastOf = (channel) => {
                const row = lastMap.get(channel);

                return row
                    ? {
                          body: row.body,
                          sender_id: row.sender_id,
                          created_at: row.created_at
                      }
                    : null;
            };

            const items = [
                ...contacts.rows.map((c) => {
                    const channel = dmChannel(me, c.id);

                    return {
                        type: "dm",
                        channel,
                        userId: c.id,
                        title: c.name,
                        subtitle: c.email,
                        last: lastOf(channel),
                        unread: unreadMap.get(channel) || 0
                    };
                }),
                ...docs.rows
                    .map((d) => {
                        const channel = `doc:${d.id}`;

                        return {
                            type: "doc",
                            channel,
                            documentId: d.id,
                            title: d.title || "Document sans titre",
                            subtitle: "Discussion du document",
                            last: lastOf(channel),
                            unread: unreadMap.get(channel) || 0
                        };
                    })
                    .filter((d) => d.last || d.documentId === currentDoc)
            ];

            items.sort((x, y) => {
                const tx = x.last ? new Date(x.last.created_at).getTime() : 0;
                const ty = y.last ? new Date(y.last.created_at).getTime() : 0;

                if (tx !== ty) return ty - tx;

                return x.title.localeCompare(y.title, "fr");
            });

            res.json({ items });
        } catch (error) {
            fail(res, "Erreur récupération des conversations.", error);
        }
    });

    /* ---------------- MESSAGES D'UNE CONVERSATION ---------------- */

    router.get("/chat/messages", authMiddleware, async (req, res) => {
        try {
            const me = Number(req.user.id);
            const channel = String(req.query.channel || "");
            const members = await resolveMembers(channel, me);

            if (!members) {
                return res.status(403).json({
                    message: "Vous n'avez pas accès à cette discussion."
                });
            }

            const limit = Math.min(
                100,
                Math.max(1, Number(req.query.limit) || 40)
            );

            const beforeValue = Number(req.query.before);
            const before =
                Number.isInteger(beforeValue) && beforeValue > 0
                    ? beforeValue
                    : null;

            const result = await pool.query(
                `
                SELECT id, channel, sender_id, sender_name, body, created_at
                FROM chat_messages
                WHERE channel = $1 AND ($2::int IS NULL OR id < $2)
                ORDER BY id DESC
                LIMIT $3
                `,
                [channel, before, limit]
            );

            let otherRead = null;
            const parsed = parseChannel(channel);

            if (parsed.type === "dm") {
                const other = me === parsed.a ? parsed.b : parsed.a;

                const read = await pool.query(
                    `
                    SELECT last_read_id FROM chat_reads
                    WHERE user_id = $1 AND channel = $2
                    `,
                    [other, channel]
                );

                otherRead = read.rows[0]?.last_read_id || 0;
            }

            res.json({
                messages: result.rows.reverse(),
                hasMore: result.rows.length === limit,
                otherRead
            });
        } catch (error) {
            fail(res, "Erreur récupération des messages.", error);
        }
    });

    /* ---------------- ENVOI D'UN MESSAGE ---------------- */

    router.post("/chat/messages", authMiddleware, async (req, res) => {
        try {
            const me = Number(req.user.id);
            const channel = String(req.body?.channel || "");
            const body = String(req.body?.body || "").trim().slice(0, MAX_BODY);

            if (!body) {
                return res.status(400).json({
                    message: "Le message ne peut pas être vide."
                });
            }

            if (!allowSend(me)) {
                return res.status(429).json({
                    message: "Vous écrivez trop vite. Patientez quelques secondes."
                });
            }

            const members = await resolveMembers(channel, me);

            if (!members) {
                return res.status(403).json({
                    message: "Vous n'avez pas le droit d'écrire dans cette discussion."
                });
            }

            const inserted = await pool.query(
                `
                INSERT INTO chat_messages (channel, sender_id, sender_name, body)
                VALUES ($1, $2, $3, $4)
                RETURNING id, channel, sender_id, sender_name, body, created_at
                `,
                [channel, me, req.user.name || null, body]
            );

            const message = inserted.rows[0];

            // Écrire, c'est avoir lu les messages précédents
            await saveRead(me, channel, message.id);

            emitTo(members, "chat-message", { channel, message });
            emitTo(members, "chat-read", {
                channel,
                userId: me,
                lastReadId: message.id
            });

            res.status(201).json(message);
        } catch (error) {
            fail(res, "Erreur lors de l'envoi du message.", error);
        }
    });

    /* ---------------- MARQUER COMME LU ---------------- */

    router.post("/chat/read", authMiddleware, async (req, res) => {
        try {
            const me = Number(req.user.id);
            const channel = String(req.body?.channel || "");
            const members = await resolveMembers(channel, me);

            if (!members) {
                return res.status(403).json({ message: "Accès refusé." });
            }

            const latest = await pool.query(
                "SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages WHERE channel = $1",
                [channel]
            );

            const lastReadId = Number(latest.rows[0].id);

            await saveRead(me, channel, lastReadId);

            emitTo(members, "chat-read", { channel, userId: me, lastReadId });

            res.json({ ok: true });
        } catch (error) {
            fail(res, "Erreur lors du marquage comme lu.", error);
        }
    });

    /* ---------------- "EST EN TRAIN D'ECRIRE" (Socket.IO) ---------------- */

    io.on("connection", (socket) => {
        socket.on("chat-typing", async ({ channel } = {}) => {
            try {
                const me = Number(socket.user?.id);

                if (!me) return;

                const members = await resolveMembers(channel, me);

                if (!members) return;

                emitTo(
                    members.filter((id) => id !== me),
                    "chat-typing",
                    { channel, userId: me, name: socket.user.name }
                );
            } catch (error) {
                // un événement "typing" perdu n'a aucune conséquence
            }
        });
    });

    return { router, prepareMessagesSchema };
};