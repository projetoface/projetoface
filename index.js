// Importações e Configurações Iniciais
const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Simulação de Sessões
let sessions = [];

// Rota para Adicionar Contas
app.post('/api/accounts', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios.' });

    const account = { email, password, status: 'Aguardando login' };
    sessions.push(account);
    res.json(account);
});

// Rota para Login
app.post('/api/login', async (req, res) => {
    const { email, password, proxy, profileId } = req.body;
    try {
        let browser;
        if (profileId) {
            const startProfile = await axios.get(`http://localhost:35000/api/v2/profile/start?automation=true&profileId=${profileId}`);
            const wsEndpoint = startProfile.data.value;
            browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
        } else {
            browser = await puppeteer.launch({ headless: false, args: proxy ? [`--proxy-server=${proxy}`] : [] });
        }

        const page = await browser.newPage();
        await page.goto('https://facebook.com/login', { waitUntil: 'domcontentloaded' });
        await page.type('#email', email, { delay: 100 });
        await page.type('#pass', password, { delay: 100 });
        await Promise.all([
            page.click('button[name="login"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        if (page.url().includes('checkpoint') || page.url().includes('login')) {
            res.status(403).json({ error: 'Checkpoint ou falha no login.' });
        } else {
            res.json({ success: true, message: 'Login bem-sucedido.' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro ao tentar logar.' });
    }
});

// Servir o Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar o Servidor
app.listen(5000, () => console.log('API rodando na porta 5000'));

// Escrever o HTML do Frontend em um arquivo
const fs = require('fs');
const frontendHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Facebook Account Manager</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .card { border: 1px solid #ccc; border-radius: 5px; padding: 20px; margin-bottom: 20px; }
        .input { padding: 10px; margin-bottom: 10px; width: 100%; box-sizing: border-box; }
        .button { padding: 10px 20px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }
        .button:hover { background-color: #0056b3; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Adicionar Conta</h2>
        <input id="email" class="input" type="text" placeholder="Email">
        <input id="password" class="input" type="password" placeholder="Senha">
        <button class="button" onclick="addAccount()">Adicionar</button>
    </div>
    <div class="card">
        <h2>Contas Cadastradas</h2>
        <div id="accounts"></div>
    </div>
    <script>
        const accountsDiv = document.getElementById('accounts');

        async function addAccount() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            if (!email || !password) {
                alert('Preencha todos os campos');
                return;
            }
            try {
                const res = await fetch('http://localhost:5000/api/accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                const data = await res.json();
                if (res.ok) {
                    const accountDiv = document.createElement('div');
                    accountDiv.textContent = \`\${data.email} — \${data.status || 'Sem status'}\`;
                    accountsDiv.appendChild(accountDiv);
                    document.getElementById('email').value = '';
                    document.getElementById('password').value = '';
                    alert('Conta adicionada!');
                } else {
                    alert(data.error || 'Erro ao adicionar.');
                }
            } catch (err) {
                alert('Erro na conexão.');
            }
        }
    </script>
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, 'index.html'), frontendHTML);
