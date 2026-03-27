const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

let ultimoQRCode = null;

// Servidor HTTP para mostrar o QR Code
app.get('/', (req, res) => {
    if (ultimoQRCode) {
        res.send(`
            <html>
                <head>
                    <title>WhatsApp Bot - QR Code</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial; text-align: center; padding: 20px; background: #000; color: #fff; }
                        img { max-width: 100%; width: 300px; margin: 20px auto; }
                        .info { color: #0f0; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <h1>📱 Escaneie o QR Code</h1>
                    <img src="/qrcode.png" />
                    <p class="info">Abra o WhatsApp Business > Configurações > WhatsApp Web > Vincular dispositivo</p>
                </body>
            </html>
        `);
    } else {
        res.send('<h1>⏳ Aguardando QR Code...</h1><p>O bot está iniciando. Atualize a página em alguns segundos.</p>');
    }
});

app.get('/qrcode.png', async (req, res) => {
    if (ultimoQRCode) {
        const qrBuffer = await QRCode.toBuffer(ultimoQRCode);
        res.set('Content-Type', 'image/png');
        res.send(qrBuffer);
    } else {
        res.status(404).send('QR Code não disponível');
    }
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📱 Acesse no seu celular: https://seu-app.onrender.com`);
});

// Configura o bot WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] }
});

client.on('message', async (message) => {
    console.log(`Mensagem: ${message.body}`);
    await message.reply('🤖 Bot online! Em breve com IA própria.');
});

client.on('qr', (qr) => {
    console.log('📱 QR Code gerado!');
    console.log('🌐 Acesse: https://seu-app.onrender.com');
    ultimoQRCode = qr;
    // Também mostra no terminal (opcional)
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Bot conectado com sucesso!');
    ultimoQRCode = null;
});

client.initialize();