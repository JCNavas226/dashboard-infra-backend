const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const xmlrpc = require('xmlrpc');

const app = express();
app.use(cors());
app.use(express.json());

// Cargar credenciales de Google Cloud desde la Variable de Entorno
const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
const auth = new google.auth.GoogleAuth({
  credentials: googleCredentials,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
  ],
});

// 1. ENDPOINT: Odoo Tickets Septiembre en Tiempo Real
app.get('/api/tickets', (req, res) => {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USER;
  const password = process.env.ODOO_PASSWORD;

  const common = xmlrpc.createSecureClient({ host: url, port: 443, path: '/xmlrpc/2/common' });
  const models = xmlrpc.createSecureClient({ host: url, port: 443, path: '/xmlrpc/2/object' });

  common.methodCall('authenticate', [db, username, password, {}], (err, uid) => {
    if (err || !uid) return res.status(500).json({ error: 'Error de autenticación con Odoo' });

    const domain = [
      ['create_date', '>=', '2026-09-01 00:00:00'],
      ['create_date', '<=', '2026-09-30 23:59:59']
    ];

    models.methodCall('execute_kw', [
      db, uid, password,
      'helpdesk.ticket', 'search_read',
      [domain],
      { fields: ['name', 'stage_id', 'team_id', 'partner_id', 'create_date'] }
    ], (err, tickets) => {
      if (err) return res.status(500).json({ error: 'Error consultando tickets en Odoo' });
      res.json({ total: tickets.length, data: tickets });
    });
  });
});

// 2. ENDPOINT: Solicitudes de Pedido Pendientes (> 3 Meses desde Mayo 2026)
app.get('/api/solicitudes', async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '19jnXufpmtRAdMyoOjDRoLk3Y48B5i7HK_-63yRzXGP0';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Hoja1!A2:Z1000',
    });

    const rows = response.data.values || [];
    const fechaActual = new Date('2026-09-07');

    const pendientes = rows.filter(row => {
      const fechaCreacion = new Date(row[2]); // Columna Fecha
      const estatus = row[5];                 // Columna Estatus
      const diasAntiguedad = (fechaActual - fechaCreacion) / (1000 * 60 * 60 * 24);

      return fechaCreacion >= new Date('2026-05-01') && 
             estatus !== 'Concluido' && 
             estatus !== 'Cerrado' && 
             diasAntiguedad > 90;
    });

    res.json({ data: pendientes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. ENDPOINT: Asistente Inteligente de Equipos por Farmacia
app.get('/api/equipos', async (req, res) => {
  const farmacia = req.query.farmacia ? req.query.farmacia.toLowerCase() : '';
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1VT4fA3MTLYF8SS8URdI6SJeKBqgicQsU';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Hoja1!A2:Z1000',
    });

    const rows = response.data.values || [];
    const filtrados = rows
      .filter(r => r[0] && r[0].toLowerCase().includes(farmacia))
      .map(r => ({
        farmacia: r[0],
        equipo: r[1],
        descripcion: r[2],
        ubicacion: r[3],
        estatus: r[4]
      }));

    res.json({ data: filtrados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
