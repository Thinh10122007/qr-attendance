const fs = require('fs');
const path = require('path');

class Storage {
  constructor(filePath) {
    this.filePath = filePath || path.join(__dirname, 'attendance_db.json');
    // Lưu danh sách các token hợp lệ kèm thời gian hết hạn riêng
    this.validTokens = new Map();
    this.currentToken = null;
    this.initDatabase();
  }

  initDatabase() {
    try {
      if (!fs.existsSync(this.filePath)) {
        fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf8');
      }
    } catch (err) {
      console.error('Lỗi khởi tạo file DB:', err);
    }
  }

  // Tạo token mới: sống cố định 60 giây (1 phút)
  generateToken(ttlSeconds = 60) {
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const token = `AT-${randomHex}`;
    const expiresAt = Date.now() + (ttlSeconds * 1000);

    // Lưu token vào bộ nhớ với hạn 60s
    this.validTokens.set(token, expiresAt);
    this.currentToken = token;

    // Dọn dẹp token đã quá hạn
    this.cleanupExpiredTokens();

    return token;
  }

  cleanupExpiredTokens() {
    const now = Date.now();
    for (const [t, exp] of this.validTokens.entries()) {
      if (now > exp) {
        this.validTokens.delete(t);
      }
    }
  }

  // Xác thực: còn trong hạn 60s là hợp lệ
  verifyToken(token) {
    if (!token) return false;
    this.cleanupExpiredTokens();
    const exp = this.validTokens.get(token);
    if (!exp) return false;
    return Date.now() <= exp;
  }

  getAll() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(data || '[]');
    } catch (err) {
      return [];
    }
  }

  addRecord(record) {
    const list = this.getAll();
    const isExisted = list.some(
      item => item.studentId.trim().toLowerCase() === record.studentId.trim().toLowerCase()
    );
    if (isExisted) {
      return { success: false, message: 'Mã SV này đã điểm danh trước đó!' };
    }

    const newEntry = {
      id: Date.now().toString(),
      studentId: record.studentId.trim(),
      fullName: record.fullName.trim(),
      className: record.className.trim(),
      timestamp: new Date().toISOString()
    };

    list.push(newEntry);
    fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf8');
    return { success: true, record: newEntry, all: list };
  }
}

module.exports = Storage;