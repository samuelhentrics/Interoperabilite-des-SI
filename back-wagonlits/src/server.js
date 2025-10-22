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

// Helpers
function xmlEscape(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUUID(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

const app = express();
app.use(cors());
app.use(express.json()); // on garde pour le webhook JSON

// ---------------- Webhook adapter (XML -> JSON FR) ----------------
const WEBHOOK_BASE = (process.env.WEBHOOK__URL || 'http://webhook-service:3000').replace(/\/+$/, '');
const WEBHOOK_FROM = process.env.WEBHOOK_FROM || 'erp-wagonlits';

/** Construit le JSON demandé pour UNE demande (avec toutes les tables liées) */
async function buildWebhookBodyForDemande(demandeId) {
  // Demande
  const { rows: dRows } = await pool.query(
    `SELECT id,
            code,
            state,
            to_char(createdAt,'YYYY-MM-DD') AS dateCreation,
            type,
            comment
     FROM demandes
     WHERE id = $1`, [demandeId]
  );
  if (dRows.length === 0) return null;
  const d = dRows[0];

  // Inspection (0..1)
  const { rows: insRows } = await pool.query(
    `SELECT id,
            to_char(inspectedAt,'YYYY-MM-DD') AS date,
            defectiveComponent AS piecedefectueuse,
            comment AS commentaire
     FROM inspection WHERE demande_id = $1`, [demandeId]
  );
  const inspection = insRows[0]
    ? {
        id: insRows[0].id,
        date: insRows[0].date,
        piecedefectueuse: insRows[0].piecedefectueuse ?? null,
        commentaire: insRows[0].commentaire ?? null,
      }
    : null;

  // Devis (0..n)
  const { rows: devisRows } = await pool.query(
    `SELECT id,
            priceComponent AS prixdepiece,
            priceHour AS prixhoraire,
            estimatedTime AS tempsestime,
            demande_id
     FROM devis WHERE demande_id = $1 ORDER BY id`, [demandeId]
  );
  const devis = devisRows.map(x => ({
    id: x.id,
    prixdepiece: x.prixdepiece === null ? null : Number(x.prixdepiece),
    prixhoraire: x.prixhoraire === null ? null : Number(x.prixhoraire),
    tempsestime: x.tempsestime === null ? null : Number(x.tempsestime),
    'demande-id': x.demande_id, // clé avec tiret OK en JSON, on l’envoie telle quelle
  }));

  // Interventions (0..n)
  const { rows: itRows } = await pool.query(
    `SELECT id,
            localisation AS lieu,
            realTime AS tempsreel,
            comment AS commentaire,
            to_char(interventionDate,'YYYY-MM-DD') AS date
     FROM intervention WHERE demande_id = $1 ORDER BY id`, [demandeId]
  );
  const interventions = itRows.map(x => ({
    id: x.id,
    lieu: x.lieu ?? null,
    tempsreel: x.tempsreel === null ? null : Number(x.tempsreel),
    commentaire: x.commentaire ?? null,
    date: x.date ?? null,
  }));

  return {
    id: d.id,
    code: d.code ?? null,
    statut: d.state,                  // state -> statut
    dateCreation: d.datecreation,     // createdAt -> dateCreation
    commentaire: d.comment ?? null,   // comment -> commentaire
    clientId: null,                   // pas en base aujourd’hui
    clientName: null,
    devis,
    interventions,
    inspection,
  };
}

/** Envoie le webhook JSON (POST /api/demande) avec from + body */
async function sendWebhookDemande(body) {
  const url = `${WEBHOOK_BASE}/api/demandes`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: WEBHOOK_FROM, body }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.error(`❌ Webhook non-ok (${resp.status}) :`, txt);
    } else {
      console.log('✅ Webhook envoyé vers', url);
    }
  } catch (e) {
    console.error('⚠️ Erreur envoi webhook :', e && e.message ? e.message : e);
  }
}

// ---------------- Swagger ----------------
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Wagonlits',
      version: '1.3.2',
      description:
        "Gestion des demandes en XML (GET/GET:id/POST/DELETE). Le POST envoie un webhook JSON avec les clés FR (statut, dateCreation, commentaire...).",
    },
    servers: [{ url: `http://localhost:${PORT}`, description: 'Dév local' }],
    components: {
      schemas: {
        DemandeXML: {
          type: 'object',
          xml: { name: 'demande' },
          properties: {
            id: { type: 'string', description: 'UUID' },
            code: { type: 'string', nullable: true },
            state: { type: 'integer' },
            createdat: { type: 'string', format: 'date' },
            type: { type: 'string', nullable: true },
            comment: { type: 'string', nullable: true },
          },
        },
        ErrorXML: {
          type: 'object',
          xml: { name: 'error' },
          properties: { message: { type: 'string' } },
        },
      },
    },
  },
  apis: ['./src/server.js'],
};
const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
 *     summary: Liste paginée des demandes (XML) avec inspection, devis, interventions
 *     tags: [Demandes]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, minimum: 1, maximum: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0, minimum: 0 }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: OK (XML)
 *         content:
 *           application/xml:
 *             schema: { type: string }
 */
app.get('/api/demandes', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10), 1), 200);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10), 0);
    const order = (req.query.order ?? 'desc').toString().toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM demandes`);
    const total = countRows[0]?.total ?? 0;

    const { rows: demandes } = await pool.query(
      `SELECT d.id, d.code, d.state, to_char(d.createdAt,'YYYY-MM-DD') AS createdat, d.type, d.comment
       FROM demandes d
       ORDER BY d.createdAt ${order}, d.id
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    if (demandes.length === 0) {
      const xmlEmpty =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<demandes>` +
        `<pagination><total>${total}</total><limit>${limit}</limit><offset>${offset}</offset><order>${order.toLowerCase()}</order></pagination>` +
        `<items></items>` +
        `</demandes>`;
      return res.status(200).type('application/xml').send(xmlEmpty);
    }

    const ids = demandes.map(d => d.id);

    const { rows: inspections } = await pool.query(
      `SELECT ins.id, to_char(ins.inspectedAt,'YYYY-MM-DD') AS inspectedat,
              ins.defectiveComponent, ins.comment, ins.demande_id
       FROM inspection ins WHERE ins.demande_id = ANY($1::uuid[])`, [ids]
    );
    const { rows: devis } = await pool.query(
      `SELECT dv.id, dv.priceComponent, dv.priceHour,
              dv.estimatedTime AS estimatedtime, dv.demande_id
       FROM devis dv WHERE dv.demande_id = ANY($1::uuid[]) ORDER BY dv.id`, [ids]
    );
    const { rows: interventions } = await pool.query(
      `SELECT it.id, to_char(it.interventionDate,'YYYY-MM-DD') AS interventiondate,
              it.localisation, it.realTime AS realtime, it.comment, it.demande_id
       FROM intervention it WHERE it.demande_id = ANY($1::uuid[]) ORDER BY it.id`, [ids]
    );

    const oneBy = (rows, key='demande_id') => rows.reduce((m, r) => m.set(r[key], r), new Map());
    const manyBy = (rows, key='demande_id') => rows.reduce((m, r) => { (m.get(r[key]) ?? m.set(r[key], []).get(r[key])).push(r); return m; }, new Map());

    const inspBy = oneBy(inspections);
    const devisBy = manyBy(devis);
    const interBy = manyBy(interventions);

    const itemsXml = demandes.map(d => {
      const ins = inspBy.get(d.id);
      const dv = devisBy.get(d.id) ?? [];
      const it = interBy.get(d.id) ?? [];

      const inspectionXml = ins ? (
        `<inspection>` +
          `<id>${xmlEscape(ins.id)}</id>` +
          `<inspectedat>${xmlEscape(ins.inspectedat)}</inspectedat>` +
          `<defectivecomponent>${xmlEscape(ins.defectivecomponent ?? '')}</defectivecomponent>` +
          `<comment>${xmlEscape(ins.comment ?? '')}</comment>` +
        `</inspection>`
      ) : '';

      const devisXml =
        `<devis>` +
        dv.map(x =>
          `<item>` +
            `<id>${xmlEscape(x.id)}</id>` +
            `<pricecomponent>${xmlEscape(x.pricecomponent)}</pricecomponent>` +
            `<pricehour>${xmlEscape(x.pricehour)}</pricehour>` +
            `<estimatedtime>${xmlEscape(x.estimatedtime)}</estimatedtime>` +
          `</item>`
        ).join('') +
        `</devis>`;

      const interventionsXml =
        `<interventions>` +
        it.map(x =>
          `<item>` +
            `<id>${xmlEscape(x.id)}</id>` +
            `<interventiondate>${xmlEscape(x.interventiondate)}</interventiondate>` +
            `<localisation>${xmlEscape(x.localisation ?? '')}</localisation>` +
            `<realtime>${xmlEscape(x.realtime ?? '')}</realtime>` +
            `<comment>${xmlEscape(x.comment ?? '')}</comment>` +
          `</item>`
        ).join('') +
        `</interventions>`;

      return (
        `<demande>` +
          `<id>${xmlEscape(d.id)}</id>` +
          `<code>${xmlEscape(d.code ?? '')}</code>` +
          `<state>${xmlEscape(d.state)}</state>` +
          `<createdat>${xmlEscape(d.createdat)}</createdat>` +
          `<type>${xmlEscape(d.type ?? '')}</type>` +
          `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
          inspectionXml + devisXml + interventionsXml +
        `</demande>`
      );
    }).join('');

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<demandes>` +
      `<pagination><total>${total}</total><limit>${limit}</limit><offset>${offset}</offset><order>${order.toLowerCase()}</order></pagination>` +
      `<items>${itemsXml}</items>` +
      `</demandes>`;

    res.status(200).type('application/xml').send(xml);
  } catch (err) {
    console.error('GET /api/demandes error:', err);
    res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to list demandes</error>`);
  }
});

/**
 * @swagger
 * /api/demandes/{id}:
 *   get:
 *     summary: Récupère une demande par id (XML) avec tables liées
 *     tags: [Demandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: OK (XML)
 *         content:
 *           application/xml:
 *             schema: { type: string }
 */
app.get('/api/demandes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) {
      return res.status(400).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid id</error>`);
    }

    // Demande
    const { rows: dRows } = await pool.query(
      `SELECT id, code, state, to_char(createdAt,'YYYY-MM-DD') AS createdat, type, comment
       FROM demandes WHERE id = $1`, [id]
    );
    if (dRows.length === 0) {
      return res.status(404).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Demande not found</error>`);
    }
    const d = dRows[0];

    // Liés
    const { rows: insRows } = await pool.query(
      `SELECT id, to_char(inspectedAt,'YYYY-MM-DD') AS inspectedat, defectiveComponent, comment
       FROM inspection WHERE demande_id = $1`, [id]
    );
    const { rows: devisRows } = await pool.query(
      `SELECT id, priceComponent, priceHour, estimatedTime AS estimatedtime
       FROM devis WHERE demande_id = $1 ORDER BY id`, [id]
    );
    const { rows: interRows } = await pool.query(
      `SELECT id, to_char(interventionDate,'YYYY-MM-DD') AS interventiondate, localisation, realTime AS realtime, comment
       FROM intervention WHERE demande_id = $1 ORDER BY id`, [id]
    );

    const inspectionXml = insRows[0] ? (
      `<inspection>` +
        `<id>${xmlEscape(insRows[0].id)}</id>` +
        `<inspectedat>${xmlEscape(insRows[0].inspectedat)}</inspectedat>` +
        `<defectivecomponent>${xmlEscape(insRows[0].defectivecomponent ?? '')}</defectivecomponent>` +
        `<comment>${xmlEscape(insRows[0].comment ?? '')}</comment>` +
      `</inspection>`
    ) : '';

    const devisXml =
      `<devis>` + devisRows.map(x =>
        `<item>` +
          `<id>${xmlEscape(x.id)}</id>` +
          `<pricecomponent>${xmlEscape(x.pricecomponent)}</pricecomponent>` +
          `<pricehour>${xmlEscape(x.pricehour)}</pricehour>` +
          `<estimatedtime>${xmlEscape(x.estimatedtime)}</estimatedtime>` +
        `</item>`
      ).join('') + `</devis>`;

    const interventionsXml =
      `<interventions>` + interRows.map(x =>
        `<item>` +
          `<id>${xmlEscape(x.id)}</id>` +
          `<interventiondate>${xmlEscape(x.interventiondate)}</interventiondate>` +
          `<localisation>${xmlEscape(x.localisation ?? '')}</localisation>` +
          `<realtime>${xmlEscape(x.realtime ?? '')}</realtime>` +
          `<comment>${xmlEscape(x.comment ?? '')}</comment>` +
        `</item>`
      ).join('') + `</interventions>`;

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<demande>` +
        `<id>${xmlEscape(d.id)}</id>` +
        `<code>${xmlEscape(d.code ?? '')}</code>` +
        `<state>${xmlEscape(d.state)}</state>` +
        `<createdat>${xmlEscape(d.createdat)}</createdat>` +
        `<type>${xmlEscape(d.type ?? '')}</type>` +
        `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
        inspectionXml + devisXml + interventionsXml +
      `</demande>`;

    res.status(200).type('application/xml').send(xml);
  } catch (err) {
    console.error('GET /api/demandes/:id error:', err);
    res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to fetch demande</error>`);
  }
});

/**
 * @swagger
 * /api/demandes:
 *   post:
 *     summary: Crée une nouvelle demande (XML) puis notifie le webhook (JSON FR)
 *     tags: [Demandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/xml:
 *           schema: { type: string }
 *     responses:
 *       201:
 *         description: Demande créée (XML)
 *         content: { application/xml: { schema: { type: string } } }
 */
app.post('/api/demandes', express.text({ type: 'application/xml' }), async (req, res) => {
  if (!req.is('application/xml')) {
    return res.status(415).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Unsupported Media Type: use application/xml</error>`);
  }

  const client = await pool.connect();
  try {
    const xml = req.body || '';
    const getTag = (name) => {
      const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
      return m ? m[1].trim() : undefined;
    };
    const nn = (v) => (v === undefined || v === '' ? null : v);

    const idVal = getTag('id'); // optionnel
    const typeVal = getTag('type');
    const commentVal = getTag('comment');
    const codeVal = getTag('code');

    if (idVal && !isUUID(idVal)) {
      return res.status(400).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid UUID for &lt;id&gt;</error>`);
    }

    await client.query('BEGIN');
    let d;
    if (idVal) {
      const { rows } = await client.query(
        `INSERT INTO demandes (id, code, state, createdat, type, comment)
         VALUES ($1, $2, 0, CURRENT_DATE, $3, $4)
         RETURNING id, code, state, to_char(createdat,'YYYY-MM-DD') AS createdat, type, comment`,
        [idVal, nn(codeVal), nn(typeVal), nn(commentVal)]
      );
      d = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO demandes (code, state, createdat, type, comment)
         VALUES ($1, 0, CURRENT_DATE, $2, $3)
         RETURNING id, code, state, to_char(createdat,'YYYY-MM-DD') AS createdat, type, comment`,
        [nn(codeVal), nn(typeVal), nn(commentVal)]
      );
      d = rows[0];
    }
    await client.query('COMMIT');

    // 🔔 Webhook JSON (avec toutes les tables — ici vides par défaut après création)
    buildWebhookBodyForDemande(d.id)
      .then(body => body && sendWebhookDemande(body))
      .catch(e => console.error('⚠️ build/send webhook error:', e));

    return res.status(201).type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<demande>` +
        `<id>${xmlEscape(d.id)}</id>` +
        `<code>${xmlEscape(d.code ?? '')}</code>` +
        `<state>${xmlEscape(d.state)}</state>` +
        `<createdat>${xmlEscape(d.createdat)}</createdat>` +
        `<type>${xmlEscape(d.type ?? '')}</type>` +
        `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
      `</demande>`
    );
  } catch (err) {
    if (err && err.code === '23505') {
      try { await client.query('ROLLBACK'); } catch {}
      return res.status(409).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Conflict: id already exists</error>`);
    }
    console.error('POST /api/demandes error:', err);
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to create demande</error>`);
  } finally {
    client.release();
  }
});


/**
 * @swagger
 * /api/demandes/{id}:
 *   put:
 *     summary: Met à jour une demande et ses tables liées (XML). Les durées sont des INTEGER (minutes). Envoie ensuite un webhook JSON complet.
 *     tags: [Demandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         description: UUID de la demande
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/xml:
 *           schema: { type: string }
 *           example: |
 *             <demande>
 *               <code>REQ-1001</code>
 *               <state>2</state>
 *               <type>Inspection</type>
 *               <comment>Maj complète</comment>
 *
 *               <inspection>
 *                 <inspectedat>2025-10-18</inspectedat>
 *                 <defectivecomponent>Door latch</defectivecomponent>
 *                 <comment>Contrôle OK</comment>
 *               </inspection>
 *
 *               <devis>
 *                 <item>
 *                   <!-- sans id => INSERT -->
 *                   <pricecomponent>150.00</pricecomponent>
 *                   <pricehour>85.00</pricehour>
 *                   <estimatedtime>150</estimatedtime>
 *                 </item>
 *               </devis>
 *
 *               <interventions>
 *                 <item>
 *                   <!-- avec id => UPDATE ; _delete true => DELETE -->
 *                   <id>UUID-EXISTANT-INTERVENTION</id>
 *                   <interventiondate>2025-10-19</interventiondate>
 *                   <localisation>Atelier A</localisation>
 *                   <realtime>105</realtime>
 *                   <comment>Remplacement effectué</comment>
 *                 </item>
 *               </interventions>
 *             </demande>
 *     responses:
 *       200:
 *         description: Demande mise à jour (XML) + webhook envoyé
 *         content:
 *           application/xml:
 *             schema: { type: string }
 *       400:
 *         description: Invalid id / Bad payload
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       404:
 *         description: Not found
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       415:
 *         description: Mauvais Content-Type
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 */
app.put('/api/demandes/:id', express.text({ type: 'application/xml' }), async (req, res) => {
  const { id } = req.params;
  if (!isUUID(id)) {
    return res.status(400).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid id</error>`);
  }
  if (!req.is('application/xml')) {
    return res.status(415).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Unsupported Media Type: use application/xml</error>`);
  }

  const client = await pool.connect();
  try {
    const xml = req.body || '';
    const getTag = (source, name) => {
      const m = source.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
      return m ? m[1].trim() : undefined;
    };
    const getAll = (source, tag) =>
      Array.from(source.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi'))).map(m => m[1]);
    const toNullIfEmpty = (v) => (v === undefined || v === '' ? null : v);
    const toBool = (v) => /^true$/i.test(String(v || '').trim());

    // vérifier existence
    const { rowCount: exists } = await client.query(`SELECT 1 FROM demandes WHERE id = $1`, [id]);
    if (exists === 0) {
      return res.status(404).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Demande not found</error>`);
    }

    await client.query('BEGIN');

    // -------- Demande (root) --------
    const codeVal = getTag(xml, 'code');
    const stateVal = getTag(xml, 'state');
    const typeVal = getTag(xml, 'type');
    const commentVal = getTag(xml, 'comment');

    const sets = [];
    const vals = [];
    let idx = 1;
    if (codeVal !== undefined)  { sets.push(`code = $${idx++}`);   vals.push(toNullIfEmpty(codeVal)); }
    if (stateVal !== undefined) { sets.push(`state = $${idx++}`);  vals.push(Number.isFinite(Number(stateVal)) ? Number(stateVal) : 0); }
    if (typeVal !== undefined)  { sets.push(`type = $${idx++}`);   vals.push(toNullIfEmpty(typeVal)); }
    if (commentVal !== undefined){ sets.push(`comment = $${idx++}`); vals.push(toNullIfEmpty(commentVal)); }
    if (sets.length > 0) {
      vals.push(id);
      await client.query(`UPDATE demandes SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    }

    // -------- Inspection (0..1) --------
    const inspectionXml = getTag(xml, 'inspection');
    if (inspectionXml !== undefined) {
      const del = getTag(inspectionXml, '_delete');
      if (toBool(del)) {
        await client.query(`DELETE FROM inspection WHERE demande_id = $1`, [id]);
      } else {
        const inspectedAt = getTag(inspectionXml, 'inspectedat');
        const defectiveComponent = getTag(inspectionXml, 'defectivecomponent');
        const commentI = getTag(inspectionXml, 'comment');

        const { rowCount: has } = await client.query(`SELECT 1 FROM inspection WHERE demande_id = $1`, [id]);
        if (has > 0) {
          const s2 = []; const v2 = []; let j = 1;
          if (inspectedAt !== undefined)       { s2.push(`inspectedAt = $${j++}`);        v2.push(toNullIfEmpty(inspectedAt)); }
          if (defectiveComponent !== undefined){ s2.push(`defectiveComponent = $${j++}`); v2.push(toNullIfEmpty(defectiveComponent)); }
          if (commentI !== undefined)          { s2.push(`comment = $${j++}`);            v2.push(toNullIfEmpty(commentI)); }
          if (s2.length > 0) {
            v2.push(id);
            await client.query(`UPDATE inspection SET ${s2.join(', ')} WHERE demande_id = $${j}`, v2);
          }
        } else {
          await client.query(
            `INSERT INTO inspection (inspectedAt, defectiveComponent, comment, demande_id)
             VALUES ($1, $2, $3, $4)`,
            [toNullIfEmpty(inspectedAt), toNullIfEmpty(defectiveComponent), toNullIfEmpty(commentI), id]
          );
        }
      }
    }

    // -------- Rapport (0..1) --------
    const rapportXml = getTag(xml, 'rapport');
    if (rapportXml !== undefined) {
      const del = getTag(rapportXml, '_delete');
      if (toBool(del)) {
        await client.query(`DELETE FROM rapport WHERE demande_id = $1`, [id]);
      } else {
        const endIntervention = getTag(rapportXml, 'endintervention');
        const commentR = getTag(rapportXml, 'comment');

        const { rowCount: has } = await client.query(`SELECT 1 FROM rapport WHERE demande_id = $1`, [id]);
        if (has > 0) {
          const s2 = []; const v2 = []; let j = 1;
          if (endIntervention !== undefined) { s2.push(`endIntervention = $${j++}`); v2.push(/^true$/i.test(String(endIntervention || ''))); }
          if (commentR !== undefined)        { s2.push(`comment = $${j++}`);         v2.push(toNullIfEmpty(commentR)); }
          if (s2.length > 0) {
            v2.push(id);
            await client.query(`UPDATE rapport SET ${s2.join(', ')} WHERE demande_id = $${j}`, v2);
          }
        } else {
          await client.query(
            `INSERT INTO rapport (endIntervention, comment, demande_id)
             VALUES ($1, $2, $3)`,
            [endIntervention !== undefined ? /^true$/i.test(String(endIntervention || '')) : null, toNullIfEmpty(commentR), id]
          );
        }
      }
    }

    // -------- Devis (0..n) — INTEGER estimatedTime --------
    const devisSection = getTag(xml, 'devis');
    if (devisSection !== undefined) {
      const items = getAll(devisSection, 'item');
      for (const item of items) {
        const dvId = getTag(item, 'id');
        const del = getTag(item, '_delete');
        const priceComponent = getTag(item, 'pricecomponent');
        const priceHour = getTag(item, 'pricehour');
        const estimatedTime = getTag(item, 'estimatedtime'); // INTEGER (minutes)

        if (dvId && isUUID(dvId)) {
          if (toBool(del)) {
            await client.query(`DELETE FROM devis WHERE id = $1 AND demande_id = $2`, [dvId, id]);
          } else {
            const s = []; const v = []; let k = 1;
            if (priceComponent !== undefined) { s.push(`priceComponent = $${k++}`); v.push(priceComponent !== null ? Number(priceComponent) : null); }
            if (priceHour !== undefined)      { s.push(`priceHour = $${k++}`);      v.push(priceHour !== null ? Number(priceHour) : null); }
            if (estimatedTime !== undefined)  {
              const n = Number(estimatedTime);
              if (!Number.isFinite(n) && estimatedTime !== '') {
                await client.query('ROLLBACK');
                return res.status(400).type('application/xml')
                  .send(`<?xml version="1.0" encoding="UTF-8"?><error>&lt;estimatedtime&gt; must be an integer</error>`);
              }
              s.push(`estimatedTime = $${k++}`); v.push(Number.isFinite(n) ? n : null);
            }
            if (s.length > 0) {
              v.push(dvId, id);
              await client.query(`UPDATE devis SET ${s.join(', ')} WHERE id = $${k++} AND demande_id = $${k}`, v);
            }
          }
        } else {
          // INSERT (pas d'id) si non marqué pour delete
          if (!toBool(del)) {
            const n = estimatedTime === undefined ? null : Number(estimatedTime);
            if (estimatedTime !== undefined && !Number.isFinite(n) && estimatedTime !== '') {
              await client.query('ROLLBACK');
              return res.status(400).type('application/xml')
                .send(`<?xml version="1.0" encoding="UTF-8"?><error>&lt;estimatedtime&gt; must be an integer</error>`);
            }
            await client.query(
              `INSERT INTO devis (priceComponent, priceHour, estimatedTime, demande_id)
               VALUES ($1, $2, $3, $4)`,
              [
                priceComponent !== undefined ? Number(priceComponent) : null,
                priceHour !== undefined ? Number(priceHour) : null,
                Number.isFinite(n) ? n : null,
                id,
              ]
            );
          }
        }
      }
    }

    // -------- Interventions (0..n) — INTEGER realTime --------
    const interventionsSection = getTag(xml, 'interventions');
    if (interventionsSection !== undefined) {
      const items = getAll(interventionsSection, 'item');
      for (const item of items) {
        const itId = getTag(item, 'id');
        const del = getTag(item, '_delete');
        const interventionDate = getTag(item, 'interventiondate');
        const localisation = getTag(item, 'localisation');
        const realTime = getTag(item, 'realtime'); // INTEGER (minutes)
        const commentI = getTag(item, 'comment');

        if (itId && isUUID(itId)) {
          if (toBool(del)) {
            await client.query(`DELETE FROM intervention WHERE id = $1 AND demande_id = $2`, [itId, id]);
          } else {
            const s = []; const v = []; let k = 1;
            if (interventionDate !== undefined) { s.push(`interventionDate = $${k++}`); v.push(toNullIfEmpty(interventionDate)); }
            if (localisation !== undefined)     { s.push(`localisation = $${k++}`);     v.push(toNullIfEmpty(localisation)); }
            if (realTime !== undefined) {
              const n = Number(realTime);
              if (!Number.isFinite(n) && realTime !== '') {
                await client.query('ROLLBACK');
                return res.status(400).type('application/xml')
                  .send(`<?xml version="1.0" encoding="UTF-8"?><error>&lt;realtime&gt; must be an integer</error>`);
              }
              s.push(`realTime = $${k++}`); v.push(Number.isFinite(n) ? n : null);
            }
            if (commentI !== undefined)         { s.push(`comment = $${k++}`);         v.push(toNullIfEmpty(commentI)); }
            if (s.length > 0) {
              v.push(itId, id);
              await client.query(`UPDATE intervention SET ${s.join(', ')} WHERE id = $${k++} AND demande_id = $${k}`, v);
            }
          }
        } else {
          if (!toBool(del)) {
            const n = realTime === undefined ? null : Number(realTime);
            if (realTime !== undefined && !Number.isFinite(n) && realTime !== '') {
              await client.query('ROLLBACK');
              return res.status(400).type('application/xml')
                .send(`<?xml version="1.0" encoding="UTF-8"?><error>&lt;realtime&gt; must be an integer</error>`);
            }
            await client.query(
              `INSERT INTO intervention (interventionDate, localisation, realTime, comment, demande_id)
               VALUES ($1, $2, $3, $4, $5)`,
              [toNullIfEmpty(interventionDate), toNullIfEmpty(localisation), Number.isFinite(n) ? n : null, toNullIfEmpty(commentI), id]
            );
          }
        }
      }
    }

    await client.query('COMMIT');

    // ---- Réponse: on renvoie le XML de la demande (comme GET by id) ----
    const { rows: dRows } = await pool.query(
      `SELECT id, code, state, to_char(createdAt,'YYYY-MM-DD') AS createdat, type, comment
       FROM demandes WHERE id = $1`, [id]
    );
    const d = dRows[0];
    const { rows: insRows } = await pool.query(
      `SELECT id, to_char(inspectedAt,'YYYY-MM-DD') AS inspectedat, defectiveComponent, comment
       FROM inspection WHERE demande_id = $1`, [id]
    );
    const { rows: devisRows } = await pool.query(
      `SELECT id, priceComponent, priceHour, estimatedTime AS estimatedtime
       FROM devis WHERE demande_id = $1 ORDER BY id`, [id]
    );
    const { rows: interRows } = await pool.query(
      `SELECT id, to_char(interventionDate,'YYYY-MM-DD') AS interventiondate, localisation, realTime AS realtime, comment
       FROM intervention WHERE demande_id = $1 ORDER BY id`, [id]
    );

    const inspectionXml2 = insRows[0] ? (
      `<inspection>` +
        `<id>${xmlEscape(insRows[0].id)}</id>` +
        `<inspectedat>${xmlEscape(insRows[0].inspectedat)}</inspectedat>` +
        `<defectivecomponent>${xmlEscape(insRows[0].defectivecomponent ?? '')}</defectivecomponent>` +
        `<comment>${xmlEscape(insRows[0].comment ?? '')}</comment>` +
      `</inspection>`
    ) : '';

    const devisXml2 =
      `<devis>` + devisRows.map(x =>
        `<item>` +
          `<id>${xmlEscape(x.id)}</id>` +
          `<pricecomponent>${xmlEscape(x.pricecomponent)}</pricecomponent>` +
          `<pricehour>${xmlEscape(x.pricehour)}</pricehour>` +
          `<estimatedtime>${xmlEscape(x.estimatedtime)}</estimatedtime>` +
        `</item>`
      ).join('') + `</devis>`;

    const interventionsXml2 =
      `<interventions>` + interRows.map(x =>
        `<item>` +
          `<id>${xmlEscape(x.id)}</id>` +
          `<interventiondate>${xmlEscape(x.interventiondate)}</interventiondate>` +
          `<localisation>${xmlEscape(x.localisation ?? '')}</localisation>` +
          `<realtime>${xmlEscape(x.realtime ?? '')}</realtime>` +
          `<comment>${xmlEscape(x.comment ?? '')}</comment>` +
        `</item>`
      ).join('') + `</interventions>`;

    const xmlOut =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<demande>` +
        `<id>${xmlEscape(d.id)}</id>` +
        `<code>${xmlEscape(d.code ?? '')}</code>` +
        `<state>${xmlEscape(d.state)}</state>` +
        `<createdat>${xmlEscape(d.createdat)}</createdat>` +
        `<type>${xmlEscape(d.type ?? '')}</type>` +
        `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
        inspectionXml2 + devisXml2 + interventionsXml2 +
      `</demande>`;

    // 🔔 Webhook JSON (tout l'objet) — asynchrone, non bloquant
    buildWebhookBodyForDemande(id)
      .then(body => body && sendWebhookDemande(body))
      .catch(e => console.error('⚠️ build/send webhook (PUT) error:', e));

    return res.status(200).type('application/xml').send(xmlOut);
  } catch (err) {
    console.error('PUT /api/demandes/:id error:', err);
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to update demande</error>`);
  } finally {
    client.release();
  }
});


/**
 * @swagger
 * /api/demandes/{id}:
 *   delete:
 *     summary: Supprime une demande (XML)
 *     tags: [Demandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Supprimé (XML) }
 */
app.delete('/api/demandes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) {
      return res.status(400).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid id</error>`);
    }
    const { rowCount } = await pool.query(`DELETE FROM demandes WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return res.status(404).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Demande not found</error>`);
    }
    return res.status(200).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><deleted><id>${xmlEscape(id)}</id></deleted>`);
  } catch (err) {
    console.error('DELETE /api/demandes/:id error:', err);
    res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to delete demande</error>`);
  }
});

// --- webhook test endpoint (facultatif)
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-signature'];
  const payload = JSON.stringify(req.body);
  console.log('📩 Webhook reçu :', payload);
  console.log('🔐 Signature :', signature);
  res.status(200).send({ message: 'Event received' });
});


async function subscribeToWebhook() {
    const subscribeUrl = process.env.WEBHOOK_SUBSCRIBE_URL;
    const callbackUrl = process.env.CALLBACK_URL || `http://localhost:${port}/webhook`;

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

  setTimeout(async () => {
            console.log('⏳ Tentative de connexion au webhook...');
            await subscribeToWebhook();
        }, 10000);
});
