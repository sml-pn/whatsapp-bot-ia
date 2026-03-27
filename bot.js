const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] }
});

// Quando o QR Code for gerado
client.on('qr', (qr) => {
    // Mostra no terminal (bagunçado mas ok)
    console.log('📱 QR Code gerado!');
    
    // Gera um link que você pode abrir no navegador
    const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    console.log('🔗 Link para escanear:');
    console.log(qrLink);
    console.log('');
    console.log('👉 Abra esse link no navegador e escaneie o QR Code com WhatsApp Business');
    
    // Também mostra o QR tradicional
    qrcode.generate(qr, { small: true });
});

// Quando o bot estiver pronto
client.on('ready', () => {
    console.log('✅ Bot conectado com sucesso!');
    console.log('🤖 Bot pronto para receber mensagens!');
});

// Responde mensagens
client.on('message', async (message) => {
    if (message.body) {
        console.log(`Mensagem recebida: ${message.body}`);
        await message.reply('🤖 Bot online! Em breve com IA própria.');
    }
});

// Inicia o cliente
client.initialize();
console.log('🚀 Iniciando bot WhatsApp...');