const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

const dbFileName = 'database.db';

async function initializeDB() {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashedGoogleId TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            memberSince DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            likes INTEGER NOT NULL DEFAULT 0,
            image_url TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            tagged_user_id INTEGER NOT NULL,
            FOREIGN KEY (post_id) REFERENCES posts (id),
            FOREIGN KEY (tagged_user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            UNIQUE(post_id, user_id),
            FOREIGN KEY (post_id) REFERENCES posts(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);

    // Insert initial data only if the tables are empty
    const usersCount = await db.get('SELECT COUNT(*) as count FROM users');
    const postsCount = await db.get('SELECT COUNT(*) as count FROM posts');

    if (usersCount.count === 0) {
        const users = [
            { username: 'user1', hashedGoogleId: 'hashedGoogleId1', avatar_url: '', memberSince: '2024-01-01 12:00:00' },
            { username: 'user2', hashedGoogleId: 'hashedGoogleId2', avatar_url: '', memberSince: '2024-01-02 12:00:00' }
        ];

        await Promise.all(users.map(user => {
            return db.run(
                'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
                [user.username, user.hashedGoogleId, user.avatar_url, user.memberSince]
            );
        }));
    }

    if (postsCount.count === 0) {
        const posts = [
            { title: 'First Post', content: 'This is the first post', username: 'user1', timestamp: '2024-01-01 12:30:00', likes: 1, image_url: null },
            { title: 'Second Post', content: 'This is the second post', username: 'user2', timestamp: '2024-01-02 12:30:00', likes: 0, image_url: null }
        ];

        await Promise.all(posts.map(post => {
            return db.run(
                'INSERT INTO posts (title, content, username, timestamp, likes, image_url) VALUES (?, ?, ?, ?, ?, ?)',
                [post.title, post.content, post.username, post.timestamp, post.likes, post.image_url]
            );
        }));
    }

    console.log('Database populated with initial data.');
    await db.close();
}

initializeDB().catch(err => {
    console.error('Error initializing database:', err);
});
