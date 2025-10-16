import express from "express";
import pkg from "pg";
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import cors from 'cors';
import 'dotenv/config';


const { Pool } = pkg;
const app = express();
const port = process.env.PORT || 3000;

// --- Middlewares globaux ---
app.use(cors());
app.use(express.json());

// --- Configuration de la base de données ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

// --- Configuration de Swagger ---
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API DevMaterial',
            version: '1.0.0',
            description: 'Documentation de l\'API pour la gestion des commandes de matériel.',
        },
        servers: [
            {
                url: `http://localhost:${port}`,
                description: 'Serveur de développement',
            },
        ],
    },
    apis: ['./src/index.js'], // Assure-toi que le chemin est correct !
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

// --- Route pour la documentation Swagger ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- Schéma de données Swagger ---
/**
 * @swagger
 * components:
 *   schemas:
 *     Commande:
 *       type: object
 *       required:
 *         - number
 *         - type
 *         - dateDemande
 *       properties:
 *         id:
 *           type: integer
 *           description: L'ID auto-généré de la commande.
 *         number:
 *           type: string
 *           description: Le numéro de la commande.
 *         type:
 *           type: string
 *           description: Le type de matériel commandé.
 *         dateDemande:
 *           type: string
 *           format: date-time
 *           description: La date de la demande de commande.
 *       example:
 *         id: 1
 *         number: "CMD-2025-001"
 *         type: "Ordinateur portable"
 *         dateDemande: "2025-10-15T09:00:00.000Z"
 */

// --- Routes de l'API ---

/**
 * @swagger
 * /api/commandes:
 *   get:
 *     summary: Récupère la liste de toutes les commandes
 *     tags: [Commandes]
 *     responses:
 *       200:
 *         description: La liste des commandes a été récupérée avec succès.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Commande'
 */
app.get("/api/commandes", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM commandes ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur lors de la récupération des commandes :', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

/**
 * @swagger
 * /api/commandes:
 *   post:
 *     summary: Crée une nouvelle commande
 *     tags: [Commandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Commande'
 *     responses:
 *       200:
 *         description: La commande a été créée avec succès.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Commande'
 *       500:
 *         description: Une erreur est survenue sur le serveur.
 */
app.post("/api/commandes", async (req, res) => {
    try {
        const { number, type, dateDemande } = req.body;
        const result = await pool.query(
            "INSERT INTO commandes (number, type, dateDemande) VALUES ($1, $2, $3) RETURNING *",
            [number, type, dateDemande]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur lors de la création de la commande :', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.listen(port, async () => {
    console.log(`✅ Backend running on port ${port}`);
    console.log(`📄 Documentation API disponible sur http://localhost:${port}/api-docs`);

    // Connexion au webhook
    if (process.env.WEBHOOK_URL) {
        try {
            const response = await fetch(process.env.WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "started", service: "back-devmaterial" }),
            });
            console.log(`🔗 Webhook connecté : ${process.env.WEBHOOK_URL} (${response.status})`);
        } catch (err) {
            console.error("❌ Erreur lors de la connexion au webhook :", err.message);
        }
    }
});
