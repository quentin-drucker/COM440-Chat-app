const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs'); // [New] (We use Node's built-in filesystem module to read/write a small JSON file on disk for persistence.)


const app = express();

// ===== [New][Start of Persistence + runtime state code additions] =====

// Build an absolute path to a file named "data.json" that will live *next to* server.js.
// __dirname  = the folder this file (server.js) is in
// path.join  = creates an OS-safe path string
const DATA_FILE = path.join(__dirname, 'data.json');

// In-memory copies we mutate while the server is running.
// These are also mirrored to disk via saveData() so we survive restarts.
let chatMessages = [];      // Array of { username, text, timestamp } - the full chat history
let messageCounts = {};     // Map of username -> number of messages they've sent (for the assignment's stats)
let clients = [];           // Active Server-Sent Events (SSE) connections (each item: { id, res })

// Load/save helpers - kept synchronous for simplicity (small file, tiny app).
// If "data.json" already exists, we read it and hydrate the in-memory variables above.
// If it doesn't exist (first run), we start with empty structures.
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      // Read the whole file as UTF-8 text, parse the JSON
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

      // Defensive checks in case file contents are missing/changed
      chatMessages  = Array.isArray(raw.messages) ? raw.messages : [];
      messageCounts = raw.counts && typeof raw.counts === 'object' ? raw.counts : {};
    }
  } catch (e) { // server can't load - contingency plan:
    // If the file is corrupt or unreadable, don't crash the server - just start fresh.
    console.error('Failed to load data.json:', e);
    chatMessages = [];
    messageCounts = {};
  }
}

// Save the current in-memory state back to disk.
// ***writes data to the file at `DATA_FILE` var, so: "<project>/data.json" in same folder as server.js
// JSON.stringify(..., null, 2) "pretty-prints" with 2-space indentation for easy manual inspection.
function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ messages: chatMessages, counts: messageCounts }, null, 2),
      'utf8'
    );
    // ^ writeFileSync overwrites/creates data.json atomically for our small use case.
    //   If the host's filesystem were set to read-only, the catch() log below would be seen.
  } catch (e) {
    console.error('Failed to save data.json:', e);
  }
}

// On server start, populate in-memory state from "data.json" (if it exists).
loadData();

// ========== [END of Persistence + runtime state code additions] ==========


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

// [Old code - Moved these var declarations to the persistence section above, verbatim]
// // Store chat messages and SSE clients
// let chatMessages = [];  // Keeps all the messages
// let clients = [];       // Keep all clients currently logged in

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
    res.json(chatMessages); // [New] - (it actually was already in the code)
});

// Post a new message
app.post('/messages', (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // ===> PUSH the received message to chatMessages (username, text, timestamp) // [New]:
    const text = (req.body && req.body.text || '').toString().trim();
    if (!text) { 
        return res.status(400).json({ success: false, error: 'Empty message' });
    }

    const message = {
    username: req.session.username,
    text,
    timestamp: Date.now()
    };
    chatMessages.push(message);

    // [New] update per-user stats 
    messageCounts[message.username] = (messageCounts[message.username] || 0) + 1;

    // [New] Save data to be "persist" to disk
    saveData();

    
    // ===> SEND the message to all clients that are logged on // [New]:
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    clients.forEach(c => c.res.write(payload));

    // also push a lightweight "stats" event so clients can refresh counts (new)
    const statsPayload = `event: stats\ndata: ${JSON.stringify(messageCounts)}\n\n`;
    clients.forEach(c => c.res.write(statsPayload));

    return res.json({ success: true });

    //res.json({ success: true }); [Old line of code]
});

// Server-Sent Events endpoint for real-time updates
app.get('/events', (req, res) => {
    if (!req.session.username) {
        return res.status(401).end();
    }
    
    // ===> PUSH new client who has joined to clients // [New]:
    const clientId = Date.now() + Math.random();
    clients.push({ id: clientId, res });

    // immediately send current stats so client can render counts (new)
    res.write(`event: stats\ndata: ${JSON.stringify(messageCounts)}\n\n`);


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
    console.log(`Link to the awesome webpage: http://localhost:${PORT}`);   // [New] added this for convenience so it prints the url to our website on server startup.

});