const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Simple user storage
const users = {
    'john': 'wrwer',
    'melvin': 'werew',
    'max': 'fgdfd',
    'nikhil': 'dgfd',
    'quentin': 'vcbc',
    'ricardo': 'cvbvc',
    'sarah': 'sdfds',
    'emmett': 'ouioi',
    'ahren': 'fsfds',
    'jackson': 'dfgfd',
    'ryan': 'zxczx',
    'prof': 'abc11'
};

// Store chat messages and SSE clients
let chatMessages = [];  // Keeps all the messages
let clients = [];       // Keep all clients currently logged in

// Routes
app.get('/', (req, res) => {
    if (req.session.username) {
        res.sendFile(path.join(__dirname, 'public', 'chat.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (users[username] && users[username] === password) {
        req.session.username = username;
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/check-auth', (req, res) => {
    res.json({ 
        authenticated: !!req.session.username,
        username: req.session.username 
    });
});

// Get all messages
app.get('/messages', (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // ===> Respond with all messages in chatMessages in jSON format
    res.json(chatMessages);
});

// Post a new message
app.post('/messages', (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // ===> PUSH the received message to chatMessages (username, text, timestamp)
    
    
    // ===> SEND the message to all clients that are logged on

    
    res.json({ success: true });
});

// Server-Sent Events endpoint for real-time updates
app.get('/events', (req, res) => {
    if (!req.session.username) {
        return res.status(401).end();
    }
    
    // ===> PUSH new client who has joined to clients
    
    // Send a comment to keep connection alive
    const keepAlive = setInterval(() => {
        res.write(':keep-alive\n\n');
    }, 30000);
    
    // Remove client on disconnect
    req.on('close', () => {
        clearInterval(keepAlive);
        clients = clients.filter(client => client.id !== clientId);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});