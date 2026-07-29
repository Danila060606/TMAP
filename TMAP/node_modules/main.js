const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const bcrypt = require('bcryptjs');
const axios = require('axios');

let mainWindow = null;
let loginWindow = null;
let users = [];
let githubToken = null; // сохраняем токен после ввода

const GITHUB_USERS_URL = 'https://raw.githubusercontent.com/Danila060606/TMAP/main/users.json';
const GITHUB_API_USERS = 'https://api.github.com/repos/Danila060606/TMAPcontents/users.json';

async function loadUsersFromGitHub() {
    try {
        const response = await axios.get(GITHUB_USERS_URL);
        users = response.data;
        console.log('Пользователи загружены с GitHub:', users.length);
    } catch (err) {
        console.error('Не удалось загрузить users.json с GitHub:', err.message);
        users = [];
    }
}

function createLoginWindow() {
    if (loginWindow) return;
    loginWindow = new BrowserWindow({
        width: 400,
        height: 450,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });
    loginWindow.loadFile('login.html');
    loginWindow.on('closed', () => {
        loginWindow = null;
    });
}

function createMainWindow() {
    if (mainWindow) return;
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

ipcMain.handle('login', async (event, { username, password }) => {
    if (!users || users.length === 0) {
        return { success: false, message: 'Нет данных пользователей. Проверьте подключение к GitHub.' };
    }
    const user = users.find(u => u.username === username);
    if (!user) {
        return { success: false, message: 'Неверный логин или пароль' };
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
        return { success: false, message: 'Неверный логин или пароль' };
    }
    return { success: true, user: { username: user.username, role: user.role } };
});

ipcMain.on('login-success', (event) => {
    if (loginWindow) {
        loginWindow.close();
    }
    createMainWindow();
});

ipcMain.on('logout', () => {
    if (mainWindow) {
        mainWindow.close();
        mainWindow = null;
    }
    if (!loginWindow) {
        createLoginWindow();
    }
});

// ----- Сохранение логотипов (с токеном) -----
ipcMain.handle('save-logos-to-github', async (event, { logosData, token }) => {
    if (!token) return { success: false, message: 'Токен не предоставлен' };
    githubToken = token; // сохраняем токен для админки
    const repo = 'Danila060606/TMAP';
    const folder = 'LOGOT';

    try {
        if (logosData.length > 0 && logosData[0].base64) {
            for (const logo of logosData) {
                const fileName = `logo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.png`;
                const content = logo.base64.split(',')[1];
                const filePath = `${folder}/${fileName}`;
                const payload = {
                    message: `Add logo ${fileName}`,
                    content: content,
                };
                await axios.put(`https://api.github.com/repos/${repo}/contents/${filePath}`, payload, {
                    headers: { Authorization: `token ${token}` }
                });
                logo.newFileName = fileName;
            }
            const jsonContent = Buffer.from(JSON.stringify(logosData, null, 2)).toString('base64');
            const jsonPath = `${folder}/logos_backup.json`;
            let sha = null;
            try {
                const getRes = await axios.get(`https://api.github.com/repos/${repo}/contents/${jsonPath}`, {
                    headers: { Authorization: `token ${token}` }
                });
                sha = getRes.data.sha;
            } catch (e) {}
            const jsonPayload = {
                message: 'Update logos backup',
                content: jsonContent,
                sha: sha || undefined
            };
            await axios.put(`https://api.github.com/repos/${repo}/contents/${jsonPath}`, jsonPayload, {
                headers: { Authorization: `token ${token}` }
            });
            return { success: true, message: 'Логотипы (PNG + JSON) сохранены на GitHub' };
        } else {
            const filePath = `${folder}/logos_backup.json`;
            const content = Buffer.from(JSON.stringify(logosData, null, 2)).toString('base64');
            let sha = null;
            try {
                const getRes = await axios.get(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
                    headers: { Authorization: `token ${token}` }
                });
                sha = getRes.data.sha;
            } catch (e) {}
            const payload = {
                message: 'Update logos backup',
                content: content,
                sha: sha || undefined
            };
            await axios.put(`https://api.github.com/repos/${repo}/contents/${filePath}`, payload, {
                headers: { Authorization: `token ${token}` }
            });
            return { success: true, message: 'Логотипы (только JSON) сохранены на GitHub' };
        }
    } catch (err) {
        console.error('Ошибка сохранения на GitHub:', err.response ? err.response.data : err.message);
        return { success: false, message: 'Ошибка сохранения: ' + (err.response ? err.response.data.message : err.message) };
    }
});

// ----- НОВЫЕ ОБРАБОТЧИКИ ДЛЯ АДМИНКИ -----
ipcMain.handle('read-users-from-github', async (event, token) => {
    if (!token) token = githubToken;
    if (!token) return { success: false, message: 'Токен не предоставлен' };
    try {
        const response = await axios.get(GITHUB_API_USERS, {
            headers: { Authorization: `token ${token}` }
        });
        // Содержимое файла в base64
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        const users = JSON.parse(content);
        return { success: true, users };
    } catch (err) {
        console.error('Ошибка чтения users.json:', err.response ? err.response.data : err.message);
        return { success: false, message: 'Ошибка чтения: ' + (err.response ? err.response.data.message : err.message) };
    }
});

ipcMain.handle('write-users-to-github', async (event, { users, token }) => {
    if (!token) token = githubToken;
    if (!token) return { success: false, message: 'Токен не предоставлен' };
    try {
        const content = Buffer.from(JSON.stringify(users, null, 2)).toString('base64');
        // Получаем текущий SHA файла
        let sha = null;
        try {
            const getRes = await axios.get(GITHUB_API_USERS, {
                headers: { Authorization: `token ${token}` }
            });
            sha = getRes.data.sha;
        } catch (e) {
            if (e.response && e.response.status === 404) {
                // файла нет – создадим
            } else {
                throw e;
            }
        }
        const payload = {
            message: 'Update users.json',
            content: content,
            sha: sha || undefined
        };
        await axios.put(GITHUB_API_USERS, payload, {
            headers: { Authorization: `token ${token}` }
        });
        // Обновляем локальный кэш пользователей
        users = users;
        return { success: true, message: 'users.json обновлён на GitHub' };
    } catch (err) {
        console.error('Ошибка записи users.json:', err.response ? err.response.data : err.message);
        return { success: false, message: 'Ошибка записи: ' + (err.response ? err.response.data.message : err.message) };
    }
});

app.whenReady().then(async () => {
    await loadUsersFromGitHub();
    createLoginWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null && loginWindow === null) {
        createLoginWindow();
    }
});