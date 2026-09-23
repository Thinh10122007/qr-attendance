const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const Storage = require('./storage');

const PORT = process.env.PORT || 3000;
const storage = new Storage();
let sseClients = [];

// Tự động tìm IP mạng LAN / Wi-Fi
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function broadcastAttendance(records) {
  const data = `data: ${JSON.stringify(records)}\n\n`;
  sseClients.forEach(res => res.write(data));
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1. Phục vụ giao diện Admin
  if (pathname === '/' || pathname === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'admin.html')));
  }

  // 2. Phục vụ giao diện Mobile cho người quét QR
  if (pathname === '/mobile') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'mobile.html')));
  }

  // 3. API cung cấp thông tin IP & Cấu hình cho Admin
  if (pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ip: getLocalIp(), port: PORT }));
  }

  // 4. API cấp phát Token mới
  if (pathname === '/api/token') {
    const duration = parseInt(parsedUrl.query.duration, 10) || 15;
    const token = storage.generateToken(duration);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, token: token }));
  }

  // 5. Kết nối Server-Sent Events (Realtime sang Admin)
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    
    // Gửi danh sách hiện tại ngay khi vừa kết nối
    res.write(`data: ${JSON.stringify(storage.getAll())}\n\n`);
    sseClients.push(res);
    
    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });
    return;
  }

  // 6. API nhận dữ liệu điểm danh từ điện thoại
  if (pathname === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!storage.verifyToken(payload.token)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, message: 'Mã QR đã hết hạn! Vui lòng quét mã mới trên màn chiếu.' }));
        }

        const result = storage.addRecord(payload);
        if (!result.success) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(result));
        }

        broadcastAttendance(result.all);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, message: 'Điểm danh thành công!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Dữ liệu không hợp lệ!' }));
      }
    });
    return;
  }

  // === BƯỚC 3 ĐẶT TẠI ĐÂY: API lấy trực tiếp danh sách điểm danh ===
  if (pathname === '/api/list') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(storage.getAll()));
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log('==================================================');
  console.log(`[OK] Server điểm danh đang chạy tại cổng: ${PORT}`);
  console.log(`-> Màn hình Admin:    http://localhost:${PORT}/admin`);
  console.log(`-> Link mạng LAN:     http://${localIp}:${PORT}/admin`);
  console.log('==================================================');
});