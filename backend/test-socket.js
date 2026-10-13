
const { io } = require("socket.io-client");

const socket = io("http://localhost:5000");

const documentId = "document-test-001";

socket.on("connect", () => {
    console.log("Connecté au serveur Socket.IO :", socket.id);

    console.log("Demande de chargement du document :", documentId);

    socket.emit("get-document", documentId);
});

socket.on("load-document", (content) => {
    console.log("Contenu reçu du serveur :", content);

    console.log("Envoi d'une sauvegarde de test...");

    socket.emit("save-document", {
        type: "document-test",
        title: "Mon premier document",
        content: "Bonjour PlateformeCollaborative !"
    });

    setTimeout(() => {
        console.log("Test terminé.");
        socket.disconnect();
    }, 1000);
});

socket.on("document-error", (error) => {
    console.error("Erreur document :", error);
});

socket.on("connect_error", (error) => {
    console.error("Erreur de connexion Socket.IO :", error.message);
});

socket.on("disconnect", () => {
    console.log("Client déconnecté.");
});