// src/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';

dotenv.config();
const { Pool } = pkg;

const PORT = Number(process.env.PORT || 3001);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'devuser',
  password: process.env.DB_PASSWORD || 'wagonpass',
  database: process.env.DB_NAME || 'db_wagonlits',
});

function isValidId(v) {
  return Number.isInteger(Number(v)) && Number(v) > 0;
}

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- Swagger ----------------
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Wagonlits',
      version: '1.0.0',
      description: "Documentation de l'API Wagonlits (gestion des demandes).",
    },
    servers: [
      { url: `http://localhost:${PORT}`, description: 'Dév local' },
    ],
  },
  // ATTENTION: chemin vers CE fichier (on est en JS, pas TS)
  apis: ['./src/server.js'],
};
const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * components:
 *   schemas:
 *     Demande:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         numero:
 *           type: string
 *           example: WAG-0001
 *         type:
 *           type: string
 *           example: creation
 *         date:
 *           type: string
 *           format: date
 *           example: 2025-10-17
 */

/**
 * @swagger
 * tags:
 *   - name: Demandes
 *     description: CRUD sur la table `demande`
 */

// ---------------- Routes ----------------

// Health
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/health', (_req, res) => res.status(200).send({ ok: true }));

/**
 * @swagger
 * /api/demandes:
 *   get:
 *     summary: Liste toutes les demandes
 *     tags: [Demandes]
 *     responses:
 *       200:
 *         description: Liste renvoyée
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Demande' }
 */
app.get('/api/demandes', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, numero, type, to_char("date",'YYYY-MM-DD') AS date
      FROM demande
      ORDER BY id DESC
    `);
    res.status(200).json(rows);
  } catch (err) {
    console.error('GET /api/demandes error:', err);
    res.status(500).json({ error: 'Failed to fetch demandes' });
  }
});

/**
 * @swagger
 * /api/demandes/{id}:
 *   get:
 *     summary: Récupère une demande par id
 *     tags: [Demandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Demande trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Demande' }
 *       400: { description: Invalid id }
 *       404: { description: Demande not found }
 */
app.get('/api/demandes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });

    const { rows } = await pool.query(`
      SELECT id, numero, type, to_char("date",'YYYY-MM-DD') AS date
      FROM demande
      WHERE id = $1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Demande not found' });
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error('GET /api/demandes/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch demande' });
  }
});

/**
 * @swagger
 * /api/demandes:
 *   post:
 *     summary: Crée une nouvelle demande
 *     tags: [Demandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [numero, type]
 *             properties:
 *               numero: { type: string }
 *               type:   { type: string }
 *               date:   { type: string, format: date }
 *             example:
 *               numero: WAG-0003
 *               type: creation
 *               date: 2025-10-17
 *     responses:
 *       201:
 *         description: Demande créée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Demande' }
 *       400: { description: Missing required fields }
 */
app.post('/api/demandes', async (req, res) => {
  try {
    const { numero, type, date } = req.body || {};
    if (!numero || !type) {
      return res.status(400).json({ error: 'Missing required fields: numero, type' });
    }

    let sql, params;
    if (date) {
      sql = `
        INSERT INTO demande (numero, type, "date")
        VALUES ($1, $2, $3)
        RETURNING id, numero, type, to_char("date",'YYYY-MM-DD') AS date
      `;
      params = [numero, type, date];
    } else {
      sql = `
        INSERT INTO demande (numero, type, "date")
        VALUES ($1, $2, CURRENT_DATE)
        RETURNING id, numero, type, to_char("date",'YYYY-MM-DD') AS date
      `;
      params = [numero, type];
    }

    const { rows } = await pool.query(sql, params);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/demandes error:', err);
    res.status(500).json({ error: 'Failed to create demande' });
  }
});

/**
 * @swagger
 * /api/demandes/{id}:
 *   put:
 *     summary: Met à jour une demande (partiel)
 *     tags: [Demandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               numero: { type: string }
 *               type:   { type: string }
 *               date:   { type: string, format: date }
 *             example:
 *               type: modification
 *               date: 2025-10-20
 *     responses:
 *       200:
 *         description: Demande mise à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Demande' }
 *       400: { description: Invalid id / Nothing to update }
 *       404: { description: Demande not found }
 */
app.put('/api/demandes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid id' });

    const { numero, type, date } = req.body || {};
    const sets = [];
    const vals = [];
    let idx = 1;

    if (numero !== undefined) { sets.push(`numero = $${idx++}`); vals.push(numero); }
    if (type   !== undefined) { sets.push(`type = $${idx++}`);   vals.push(type);   }
    if (date   !== undefined) { sets.push(`"date" = $${idx++}`); vals.push(date);   }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    vals.push(id);

    const updateSql = `UPDATE demande SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id`;
    const upd = await pool.query(updateSql, vals);
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Demande not found' });

    const { rows } = await pool.query(`
      SELECT id, numero, type, to_char("date",'YYYY-MM-DD') AS date
      FROM demande WHERE id = $1
    `, [id]);

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error('PUT /api/demandes/:id error:', err);
    res.status(500).json({ error: 'Failed to update demande' });
  }
});

// --- webhook ---
app.post("/webhook", (req, res) => {
    const signature = req.headers["x-signature"];
    const payload = JSON.stringify(req.body);

    console.log("📩 Webhook reçu :", payload);
    console.log("🔐 Signature :", signature);

    res.status(200).send({ message: "Event received" });
});


async function subscribeToWebhook() {
    const subscribeUrl = process.env.WEBHOOK_SUBSCRIBE_URL;
    const callbackUrl = process.env.CALLBACK_URL || `http://localhost:${PORT}/webhook`;

    if (!subscribeUrl) {
        console.warn('⚠️ WEBHOOK_SUBSCRIBE_URL is not defined — skipping webhook subscription');
        return;
    }

    try {
        const who = process.env.WEBHOOK_WHO || 'erp-wagonlits';
        console.log(`➡️ Subscribing to webhook at ${subscribeUrl} as '${who}' with callback ${callbackUrl}`);
        const response = await fetch(subscribeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ who, url: callbackUrl }),
        });

        if (response.ok) {
            console.log(`✅ Connecté au webhook : ${subscribeUrl} (who=${who})`);
        } else {
            const text = await response.text().catch(() => '<no body>');
            console.error('❌ Erreur lors de la connexion au webhook :', text);
        }
    } catch (err) {
        console.error('⚠️ Impossible de se connecter au webhook :', err && err.message ? err.message : err);
    }
}

app.listen(PORT, () => {
  console.log(`✅ back-wagonlits on http://0.0.0.0:${PORT}`);
  console.log(`📄 Swagger UI on http://localhost:${PORT}/api-docs`);

  // Connexion au webhook
    setTimeout(async () => {
        console.log('⏳ Tentative de connexion au webhook...');
        await subscribeToWebhook();
    }, 10000);

});
