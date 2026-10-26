// api/tickets.js
const xmlrpc = require('xmlrpc');

module.exports = async (req, res) => {
    // 1. Cabeceras CORS para permitir lectura desde GitHub Pages
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Leemos las variables tal cual las tienes en Vercel
    const url = process.env.ODOO_URL || 'https://odoo.dronena.com';
    const db = process.env.ODOO_DB || 'dronena';
    const username = process.env.ODOO_USER || process.env.ODOO_USERNAME;
    const password = process.env.ODOO_PASSWORD;

    if (!username || !password) {
        return res.status(500).json({ 
            status: 'error', 
            message: 'Faltan variables de entorno ODOO_USER o ODOO_PASSWORD en Vercel' 
        });
    }

    try {
        const commonClient = xmlrpc.createSecureClient({
            url: `${url}/xmlrpc/2/common`
        });

        // 2. Autenticación contra Odoo
        const uid = await new Promise((resolve, reject) => {
            commonClient.methodCall('authenticate', [db, username, password, {}], (err, value) => {
                if (err) return reject(err);
                if (!value) return reject(new Error('Credenciales de Odoo inválidas'));
                resolve(value);
            });
        });

        const modelsClient = xmlrpc.createSecureClient({
            url: `${url}/xmlrpc/2/object`
        });

        // 3. Traer los tickets de los 3 equipos (Central: 5, Occidente: 8, Oriente: 77)
        // Sin filtro de fecha restrictivo para que traiga el año completo 2026
        const domain = [
            ['team_id', 'in', [5, 8, 77]]
        ];

        const fields = [
            'id',
            'name',
            'create_date',
            'stage_id',
            'team_id',
            'user_id',
            'partner_id',
            'ticket_type'
        ];

        const tickets = await new Promise((resolve, reject) => {
            modelsClient.methodCall(
                'execute_kw',
                [
                    db,
                    uid,
                    password,
                    'helpdesk.ticket',
                    'search_read',
                    [domain],
                    {
                        fields: fields,
                        limit: 5000, // Evita el límite de 80 tickets
                        order: 'create_date desc'
                    }
                ],
                (err, value) => {
                    if (err) return reject(err);
                    resolve(value);
                }
            );
        });

        return res.status(200).json({
            status: 'success',
            total: tickets.length,
            data: tickets
        });

    } catch (error) {
        console.error('Error al conectar con Odoo:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Error al consultar Odoo'
        });
    }
};
