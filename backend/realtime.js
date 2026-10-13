/*
 * Relais des curseurs / présence (Yjs awareness).
 * Les droits d'accès sont vérifiés une fois au moment de rejoindre le document.
 */

module.exports = function registerRealtimeExtras(io, getDocumentPermission) {
    io.on("connection", (socket) => {
        let joinedDocumentId = null;
        let awarenessClientId = null;

        socket.on("yjs-join", async ({ documentId } = {}) => {
            try {
                if (!documentId || typeof documentId !== "string") {
                    return;
                }

                const access = await getDocumentPermission(
                    documentId,
                    socket.user.id
                );

                joinedDocumentId = access ? documentId : null;
            } catch (error) {
                joinedDocumentId = null;
            }
        });

        socket.on("awareness-update", (payload = {}) => {
            const { documentId, update, clientId } = payload;

            if (!joinedDocumentId || documentId !== joinedDocumentId) {
                return;
            }

            if (typeof update !== "string" || update.length > 20000) {
                return;
            }

            if (Number.isInteger(clientId)) {
                awarenessClientId = clientId;
            }

            socket
                .to(`yjs-document-${joinedDocumentId}`)
                .emit("awareness-update", { documentId, update });
        });

        socket.on("disconnect", () => {
            if (joinedDocumentId && awarenessClientId !== null) {
                io.to(`yjs-document-${joinedDocumentId}`).emit(
                    "awareness-remove",
                    {
                        documentId: joinedDocumentId,
                        clientIds: [awarenessClientId]
                    }
                );
            }
        });
    });
};