const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const { Redis } = require('@upstash/redis');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'https://bot-whatsapp-wd45.onrender.com/mensagem';

// Conectar ao Redis (Upstash)
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

let ultimoQRCode = null;
let sock = null;
let reconnectAttempts = 0;
let status = 'iniciando';

// Função para salvar a sessão no Redis
async function saveSession(sessionData) {
    try {
        await redis.set('whatsapp-session', JSON.stringify(sessionData));
        console.log('✅ Sessão salva no Redis');
    } catch (err) {
        console.error('❌ Falha ao salvar sessão:', err.message);
    }
}

// Função para carregar a sessão do Redis
async function loadSession() {
    try {
        const data = await redis.get('whatsapp-session');
        if (data) {
            console.log('✅ Sessão carregada do Redis');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('❌ Falha ao carregar sessão:', err.message);
    }
    return null;
}

// Página principal - mostra QR Code ou status
app.get('/', async (req, res) => {
    if (status === 'connected') {
        res.send(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>WhatsApp Bot</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: #0f0; }
                        .connected { color: #0f0; font-size: 32px; font-weight: bold; }
                        .info { color: #fff; margin-top: 20px; font-size: 18px; }
                        .status { background: #1a1a1a; padding: 20px; border-radius: 10px; display: inline-block; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="connected">✅ BOT CONECTADO!</div>
                    <div class="status">
                        <div class="info">📱 WhatsApp Bot está online</div>
                        <div class="info">🤖 Número: ${sock?.user?.id || 'carregando...'}</div>
                        <div class="info">⏱️ Online há: ${Math.floor(process.uptime())} segundos</div>
                    </div>
                </body>
            </html>
        `);
    } else if (ultimoQRCode) {
        // Gera o QR Code como imagem
        const qrBuffer = await QRCode.toBuffer(ultimoQRCode, { width: 400, margin: 2 });
        res.set('Content-Type', 'image/png');
        res.send(qrBuffer);
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>WhatsApp Bot</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: #fff; }
                        .loading { color: #ff0; font-size: 24px; }
                        .info { margin-top: 20px; color: #888; }
                        .refresh { margin-top: 30px; padding: 10px 20px; background: #007bff; color: #fff; border: none; border-radius: 5px; cursor: pointer; }
                    </style>
                </head>
                <body>
                    <div class="loading">⏳ Aguardando QR Code...</div>
                    <div class="info">Atualize a página em alguns segundos.</div>
                    <button class="refresh" onclick="location.reload()">🔄 Atualizar</button>
                </body>
            </html>
        `);
    }
});

// Endpoint de health check
app.get('/health', (req, res) => {
    res.json({ 
        status: status,
        connected: sock?.user ? true : false,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

async function start() {
    console.log('🚀 Iniciando conector WhatsApp...');
    status = 'iniciando';
    
    // Tentar carregar sessão salva
    const savedSession = await loadSession();
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    // Se tiver sessão salva, restaura
    if (savedSession) {
        state.creds = savedSession.creds;
        if (savedSession.keys) state.keys = savedSession.keys;
        console.log('📂 Sessão restaurada do Redis');
    }
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Chrome (Linux)', 'Desktop', '1.0.0'],
        keepAliveIntervalMs: 25000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        printQRInTerminal: false  // Não mostra QR no terminal
    });
    
    // Salvar credenciais quando atualizadas
    sock.ev.on('creds.update', async () => {
        const fullState = {
            creds: sock.authState.creds,
            keys: sock.authState.keys
        };
        await saveSession(fullState);
        saveCreds();
        console.log('💾 Credenciais salvas no Redis');
    });
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 QR Code gerado!');
            ultimoQRCode = qr;
            status = 'aguardando_qr';
            console.log('🌐 Acesse: https://' + process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT);
        }
        
        if (connection === 'open') {
            reconnectAttempts = 0;
            status = 'connected';
            ultimoQRCode = null;
            console.log('✅ Conectado ao WhatsApp!');
            console.log(`📱 Número do BOT: ${sock.user.id}`);
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect) {
                const delay = Math.min(5000 * Math.pow(2, reconnectAttempts), 60000);
                reconnectAttempts++;
                status = 'reconectando';
                console.log(`🔄 Reconectando em ${delay/1000}s... (tentativa ${reconnectAttempts})`);
                setTimeout(start, delay);
            } else {
                status = 'desconectado';
                console.log('❌ Desconectado permanentemente. Escaneie o QR novamente.');
                ultimoQRCode = null;
            }
        }
    });
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const jid = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;
        
        console.log(`📩 Mensagem de ${jid}: ${text}`);
        
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: jid, texto: text })
            });
            const data = await response.json();
            await sock.sendMessage(jid, { text: data.resposta || 'Erro ao processar' });
            console.log(`✅ Resposta enviada para ${jid}`);
        } catch (err) {
            console.error('❌ Erro ao chamar API:', err.message);
            await sock.sendMessage(jid, { text: '❌ Erro no servidor. Tente novamente.' });
        }
    });
}

// Inicia servidor e bot
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
    console.log(`📱 Acesse no celular: http://localhost:${PORT}`);
    start();
});