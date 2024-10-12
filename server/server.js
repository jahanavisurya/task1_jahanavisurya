const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 5000;

// Ensure necessary directories exist
const databaseDir = path.join(__dirname, 'database');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(databaseDir)){
    fs.mkdirSync(databaseDir, { recursive: true });
    console.log('Database directory created.');
}

if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Uploads directory created.');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Database setup
const dbPath = path.join(databaseDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      social_media TEXT
    )`, (err) => {
      if (err) {
        console.error('Error creating users table:', err);
      } else {
        console.log('Users table created or already exists.');
      }
    });
    db.run(`CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      filename TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`, (err) => {
      if (err) {
        console.error('Error creating images table:', err);
      } else {
        console.log('Images table created or already exists.');
      }
    });
  }
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// API Routes
app.post('/api/submit', upload.array('images', 5), (req, res) => {
  const { name, socialMedia } = req.body;
  const files = req.files;

  if (!name || !socialMedia || !files || files.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run('INSERT INTO users (name, social_media) VALUES (?, ?)', [name, socialMedia], function(err) {
    if (err) {
      console.error('Error inserting user:', err);
      return res.status(500).json({ error: err.message });
    }
    const userId = this.lastID;

    const imageInserts = files.map(file => {
      return new Promise((resolve, reject) => {
        db.run('INSERT INTO images (user_id, filename) VALUES (?, ?)', [userId, file.filename], (err) => {
          if (err) {
            console.error('Error inserting image:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });

    Promise.all(imageInserts)
      .then(() => res.status(201).json({ message: 'User and images added successfully' }))
      .catch(err => {
        console.error('Error inserting images:', err);
        res.status(500).json({ error: err.message });
      });
  });
});

app.get('/api/submissions', (req, res) => {
  db.all(`SELECT users.*, GROUP_CONCAT(images.filename) as images
          FROM users
          LEFT JOIN images ON users.id = images.user_id
          GROUP BY users.id`, (err, rows) => {
    if (err) {
      console.error('Error fetching submissions:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows.map(row => ({
      ...row,
      images: row.images ? row.images.split(',') : []
    })));
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});