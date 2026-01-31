/**
 * routes/calendarRoutes.js
 * Endpoints para configuración inicial de Google Calendar
 */
const express = require('express');
const router = express.Router();
const CalendarService = require('../services/CalendarService');

/**
 * GET /api/calendar/auth
 * Obtiene la URL de autorización de Google
 * Usar solo para configuración inicial
 */
router.get('/auth', (req, res) => {
    try {
        const authUrl = CalendarService.getAuthUrl();
        
        res.send(`
            <html>
                <head>
                    <title>Google Calendar - Autorización</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            max-width: 600px;
                            margin: 50px auto;
                            padding: 20px;
                            background: #f5f5f5;
                        }
                        .container {
                            background: white;
                            padding: 30px;
                            border-radius: 10px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                        h1 {
                            color: #1a73e8;
                        }
                        .btn {
                            display: inline-block;
                            padding: 12px 24px;
                            background: #1a73e8;
                            color: white;
                            text-decoration: none;
                            border-radius: 5px;
                            margin-top: 20px;
                        }
                        .btn:hover {
                            background: #1557b0;
                        }
                        .info {
                            background: #e8f4fd;
                            padding: 15px;
                            border-left: 4px solid #1a73e8;
                            margin: 20px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🔑 Configuración de Google Calendar</h1>
                        <p>Haz clic en el botón para autorizar Piano Link a crear eventos en tu calendario.</p>
                        
                        <div class="info">
                            <strong>📋 Instrucciones:</strong>
                            <ol>
                                <li>Click en "Autorizar"</li>
                                <li>Selecciona tu cuenta de Google</li>
                                <li>Acepta los permisos</li>
                                <li>Copia el <strong>refresh_token</strong> que aparece</li>
                                <li>Agrégalo a tu .env como <code>GOOGLE_CALENDAR_REFRESH_TOKEN</code></li>
                            </ol>
                        </div>
                        
                        <a href="${authUrl}" class="btn">Autorizar Google Calendar</a>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Error generando URL de autorización: ' + error.message);
    }
});

/**
 * GET /api/calendar/oauth2callback
 * Callback de OAuth2 - Recibe el código y muestra el refresh token
 */
router.get('/oauth2callback', async (req, res) => {
    try {
        const { code } = req.query;
        
        if (!code) {
            return res.status(400).send('Código de autorización no recibido');
        }
        
        const tokens = await CalendarService.getTokensFromCode(code);
        
        res.send(`
            <html>
                <head>
                    <title>Autorización Exitosa</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            max-width: 700px;
                            margin: 50px auto;
                            padding: 20px;
                            background: #f5f5f5;
                        }
                        .container {
                            background: white;
                            padding: 30px;
                            border-radius: 10px;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                        h1 {
                            color: #34a853;
                        }
                        .token-box {
                            background: #f9f9f9;
                            padding: 15px;
                            border: 1px solid #ddd;
                            border-radius: 5px;
                            margin: 20px 0;
                            word-break: break-all;
                            font-family: monospace;
                            font-size: 12px;
                        }
                        .warning {
                            background: #fff3cd;
                            padding: 15px;
                            border-left: 4px solid #ffc107;
                            margin: 20px 0;
                        }
                        .success {
                            background: #d4edda;
                            padding: 15px;
                            border-left: 4px solid #28a745;
                            margin: 20px 0;
                        }
                        .copy-btn {
                            background: #34a853;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                        }
                        .copy-btn:hover {
                            background: #2d8e47;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>✅ Autorización Exitosa</h1>
                        
                        <div class="success">
                            <strong>¡Perfecto!</strong> Google Calendar ha sido autorizado correctamente.
                        </div>
                        
                        <h2>🔑 Refresh Token</h2>
                        <p>Copia este token y agrégalo a tu archivo <code>.env</code>:</p>
                        
                        <div class="token-box" id="token">
                            ${tokens.refresh_token || 'No disponible'}
                        </div>
                        
                        <button class="copy-btn" onclick="copyToken()">📋 Copiar Token</button>
                        
                        <div class="warning">
                            <strong>⚠️ Importante:</strong>
                            <ul>
                                <li>Guarda este token en un lugar seguro</li>
                                <li>No lo compartas públicamente</li>
                                <li>Agrégalo a <code>.env</code> como:<br>
                                    <code>GOOGLE_CALENDAR_REFRESH_TOKEN=${tokens.refresh_token || ''}</code>
                                </li>
                                <li>Reinicia tu servidor después de agregarlo</li>
                            </ul>
                        </div>
                        
                        <h3>📋 Próximos Pasos:</h3>
                        <ol>
                            <li>Abre tu archivo <code>.env</code></li>
                            <li>Pega el token copiado</li>
                            <li>Reinicia el servidor: <code>npm start</code></li>
                            <li>¡Listo! Ya puedes programar demos automáticamente</li>
                        </ol>
                    </div>
                    
                    <script>
                        function copyToken() {
                            const token = document.getElementById('token').textContent.trim();
                            navigator.clipboard.writeText(token).then(() => {
                                alert('✅ Token copiado al portapapeles');
                            });
                        }
                    </script>
                </body>
            </html>
        `);
        
    } catch (error) {
        console.error('[Calendar] Error en callback:', error);
        res.status(500).send('Error obteniendo tokens: ' + error.message);
    }
});

/**
 * GET /api/calendar/status
 * Verifica si Google Calendar está configurado
 */
router.get('/status', (req, res) => {
    res.json({
        configured: CalendarService.isConfigured,
        message: CalendarService.isConfigured 
            ? 'Google Calendar está configurado correctamente'
            : 'Google Calendar no está configurado. Visita /api/calendar/auth para configurarlo.'
    });
});

module.exports = router;
