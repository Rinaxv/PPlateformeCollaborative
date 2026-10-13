const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                message: "Token JWT manquant."
            });
        }

        const parts = authHeader.split(" ");

        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                message: "Format du token invalide."
            });
        }

        const token = parts[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = {
            id: decoded.id,
            name: decoded.name,
            email: decoded.email
        };

        next();

    } catch (error) {

        console.error("JWT Error :", error.message);

        return res.status(401).json({
            message: "Token invalide ou expiré."
        });
    }
}

module.exports = authMiddleware;