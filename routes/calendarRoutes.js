/**
 * routes/calendarRoutes.js
 * Endpoints para configuración inicial de Google Calendar
 */
const express = require('express');
const router = express.Router();

// 🔒 LAZY LOADING: CalendarService carga googleapis (~60MB), solo cargar cuando se necesite
let _calendarService = null;
function getCalendarService() {
    if (!_calendarService) {
        _calendarService = require('../services/CalendarService');
    }
    return _calendarService;
}

/**
 * GET /api/calendar/auth
 * Obtiene la URL de autorización de Google
 * Usar solo para configuración inicial
 */
router.get('/auth', async (req, res) => {
    try {
        const authUrl = await getCalendarService().getAuthUrl();
        
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
        console.error('[Calendar Route] Error en /auth:', error.message);
        res.status(500).send(`
            <html>
                <head>
                    <title>Error - Configuración Requerida</title>
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
                            color: #e74c3c;
                        }
                        .error {
                            background: #fdecea;
                            padding: 15px;
                            border-left: 4px solid #e74c3c;
                            margin: 20px 0;
                        }
                        .info {
                            background: #e8f4fd;
                            padding: 15px;
                            border-left: 4px solid #1a73e8;
                            margin: 20px 0;
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
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>⚠️ Configuración Requerida</h1>
                        
                        <div class="error">
                            <strong>Error:</strong> ${error.message}
                        </div>
                        
                        <div class="info">
                            <strong>📋 Instrucciones:</strong>
                            <ol>
                                <li>Ve al <strong>Panel de Admin</strong></li>
                                <li>Click en <strong>📅 Calendar</strong></li>
                                <li>Ingresa tus credenciales de Google Cloud:
                                    <ul>
                                        <li>Client ID</li>
                                        <li>Client Secret</li>
                                        <li>Redirect URI</li>
                                    </ul>
                                </li>
                                <li>Haz click en <strong>Guardar Credenciales</strong></li>
                                <li>Luego regresa a esta página para autorizar</li>
                            </ol>
                        </div>
                        
                        <a href="/admin.html" class="btn">Ir al Panel de Admin</a>
                    </div>
                </body>
            </html>
        `);
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
        
        const tokens = await getCalendarService().getTokensFromCode(code);
        
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
                                <li>Pégalo en <strong>Admin Panel → 📅 Calendar → Refresh Token</strong></li>
                                <li>O agrégalo a <code>.env</code> como:<br>
                                    <code>GOOGLE_CALENDAR_REFRESH_TOKEN=${tokens.refresh_token || ''}</code>
                                </li>
                            </ul>
                        </div>
                        
                        <h3>📋 Próximos Pasos:</h3>
                        <ol>
                            <li><strong>Opción A (Recomendado):</strong> Ve a <code>/admin.html</code> → Pestaña "📅 Calendar" → Pega el token</li>
                            <li><strong>Opción B:</strong> Abre tu archivo <code>.env</code> y pega el token</li>
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
    const calService = getCalendarService();
    res.json({
        configured: calService.isConfigured,
        message: calService.isConfigured 
            ? 'Google Calendar está configurado correctamente'
            : 'Google Calendar no está configurado. Visita /api/calendar/auth para configurarlo.'
    });
});

/**
 * GET /api/calendar/test
 * Prueba la conexión con Google Calendar
 */
router.get('/test', async (req, res) => {
    try {
        const calService = getCalendarService();
        if (!calService.isConfigured) {
            return res.json({
                success: false,
                message: 'Google Calendar no está configurado',
                hint: 'Configura las credenciales en Admin Panel → 📅 Calendar'
            });
        }

        // Intentar listar calendarios como test de conexión
        const result = await calService.testConnection();
        
        res.json({
            success: true,
            message: 'Conexión exitosa con Google Calendar',
            ...result
        });
        
    } catch (error) {
        console.error('[Calendar] Error en test:', error.message);
        res.json({
            success: false,
            message: 'Error al conectar con Google Calendar',
            error: error.message
        });
    }
});

module.exports = router;
