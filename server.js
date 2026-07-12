require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

// ---------- Basic bad-word filter (extend this list as needed) ----------
const BLOCKED_WORDS = ['badword1', 'badword2']; // TODO: add real filter words
function containsBlockedWord(text) {
  const lower = text.toLowerCase();
  return BLOCKED_WORDS.some(w => lower.includes(w));
}

// ---------- In-memory state (no database) ----------
// waitingQueue: array of socket ids waiting for a partner
let waitingQueue = [];
// activePairs: Map socket.id -> partner socket.id
let activePairs = new Map();
// users: Map socket.id -> { nickname, ip, connectedAt }
let users = new Map();
// bannedIPs: Set of banned IP addresses
let bannedIPs = new Set();
// reports: array of { from, against, reason, time }
let reports = [];

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'popin-chat-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 hours
}));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Admin auth middleware ----------
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: 'Wrong password' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/admin/status', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ---------- Admin data APIs ----------
app.get('/admin/stats', requireAdmin, (req, res) => {
  const onlineUsers = Array.from(users.entries()).map(([id, u]) => ({
    id,
    nickname: u.nickname,
    ip: u.ip,
    connectedAt: u.connectedAt,
    status: activePairs.has(id) ? 'chatting' : (waitingQueue.includes(id) ? 'waiting' : 'idle')
  }));
  res.json({
    totalOnline: users.size,
    waiting: waitingQueue.length,
    activeChats: activePairs.size / 2,
    users: onlineUsers,
    bannedIPs: Array.from(bannedIPs),
    reports
  });
});

app.post('/admin/kick', requireAdmin, (req, res) => {
  const { socketId } = req.body;
  const target = io.sockets.sockets.get(socketId);
  if (target) {
    target.emit('kicked', { reason: 'Removed by admin' });
    target.disconnect(true);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'User not found' });
});

app.post('/admin/ban', requireAdmin, (req, res) => {
  const { ip, socketId } = req.body;
  let bannedIp = ip;
  if (!bannedIp && socketId && users.has(socketId)) {
    bannedIp = users.get(socketId).ip;
  }
  if (!bannedIp) return res.status(400).json({ error: 'No IP provided' });
  bannedIPs.add(bannedIp);
  // also kick if currently connected
  if (socketId) {
    const target = io.sockets.sockets.get(socketId);
    if (target) {
      target.emit('kicked', { reason: 'Banned by admin' });
      target.disconnect(true);
    }
  }
  res.json({ success: true, bannedIPs: Array.from(bannedIPs) });
});

app.post('/admin/unban', requireAdmin, (req, res) => {
  const { ip } = req.body;
  bannedIPs.delete(ip);
  res.json({ success: true, bannedIPs: Array.from(bannedIPs) });
});

// ---------- Helper: try to pair waiting users ----------
function tryPairing() {
  while (waitingQueue.length >= 2) {
    const a = waitingQueue.shift();
    const b = waitingQueue.shift();
    const socketA = io.sockets.sockets.get(a);
    const socketB = io.sockets.sockets.get(b);
    if (!socketA || !socketB) {
      // one of them disconnected while in queue, requeue the valid one
      if (socketA) waitingQueue.unshift(a);
      if (socketB) waitingQueue.unshift(b);
      continue;
    }
    activePairs.set(a, b);
    activePairs.set(b, a);
    const nickA = users.get(a)?.nickname || 'Stranger';
    const nickB = users.get(b)?.nickname || 'Stranger';
    socketA.emit('paired', { partnerNickname: nickB });
    socketB.emit('paired', { partnerNickname: nickA });
  }
}

function removeFromQueue(socketId) {
  waitingQueue = waitingQueue.filter(id => id !== socketId);
}

function endChat(socketId, notifyPartner = true) {
  const partnerId = activePairs.get(socketId);
  if (partnerId) {
    activePairs.delete(socketId);
    activePairs.delete(partnerId);
    if (notifyPartner) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit('partner-left');
      }
    }
  }
}

function getClientIP(socket) {
  return socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()
    || socket.handshake.address;
}

// ---------- Socket.io events ----------
io.on('connection', (socket) => {
  const ip = getClientIP(socket);

  if (bannedIPs.has(ip)) {
    socket.emit('banned');
    socket.disconnect(true);
    return;
  }

  socket.on('set-nickname', (nickname) => {
    let clean = (nickname || '').toString().trim().slice(0, 20);
    if (!clean) clean = 'Anonymous' + Math.floor(Math.random() * 10000);
    if (containsBlockedWord(clean)) clean = 'Anonymous' + Math.floor(Math.random() * 10000);

    users.set(socket.id, { nickname: clean, ip, connectedAt: new Date().toISOString() });
    socket.emit('nickname-accepted', { nickname: clean });
  });

  socket.on('find-partner', () => {
    if (!users.has(socket.id)) return; // must set nickname first
    if (activePairs.has(socket.id)) return; // already chatting
    if (!waitingQueue.includes(socket.id)) {
      waitingQueue.push(socket.id);
    }
    tryPairing();
  });

  socket.on('send-message', (text) => {
    const partnerId = activePairs.get(socket.id);
    if (!partnerId) return;
    const msg = (text || '').toString().slice(0, 1000);
    if (!msg.trim()) return;
    if (containsBlockedWord(msg)) {
      socket.emit('system-message', 'Your message was blocked for inappropriate content.');
      return;
    }
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit('receive-message', { text: msg });
    }
  });

  socket.on('typing', () => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) partnerSocket.emit('partner-typing');
    }
  });

  socket.on('skip', () => {
    endChat(socket.id, true);
    removeFromQueue(socket.id);
    waitingQueue.push(socket.id);
    tryPairing();
  });

  socket.on('stop-chat', () => {
    endChat(socket.id, true);
    removeFromQueue(socket.id);
  });

  socket.on('report', ({ reason }) => {
    const partnerId = activePairs.get(socket.id);
    const fromNick = users.get(socket.id)?.nickname || 'Unknown';
    const againstNick = partnerId ? (users.get(partnerId)?.nickname || 'Unknown') : 'N/A';
    const againstIP = partnerId ? users.get(partnerId)?.ip : null;
    reports.push({
      from: fromNick,
      against: againstNick,
      againstIP,
      againstSocketId: partnerId || null,
      reason: (reason || 'No reason given').toString().slice(0, 300),
      time: new Date().toISOString()
    });
    socket.emit('system-message', 'Report submitted. Thank you.');
  });

  socket.on('disconnect', () => {
    endChat(socket.id, true);
    removeFromQueue(socket.id);
    users.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Popin server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html (password set via ADMIN_PASSWORD env var)`);
});
