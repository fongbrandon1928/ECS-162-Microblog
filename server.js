const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const dotenv = require('dotenv');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const Handlebars = require('handlebars'); // Import Handlebars
const multer = require('multer');
const fs = require('fs');

// Load environment variables from .env file
dotenv.config();

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

async function connectToDatabase() {
    const db = await sqlite.open({ filename: 'database.db', driver: sqlite3.Database });
    console.log('Connected to the SQLite database.');
    return db;
}

let db;
connectToDatabase().then(database => {
    db = database;
}).catch(err => {
    console.error('Failed to connect to the database:', err);
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only .png and .jpg images are allowed!'));
        }
    }
});

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Define and register the linkifyMentions helper
Handlebars.registerHelper('formatContent', function(content) {
    const formattedContent = content.replace(/@(\w+)/g, '<a href="/profile/$1" class="tagged-user-link">@$1</a>');
    return new Handlebars.SafeString(formattedContent);
});


// Set up Handlebars view engine with custom helpers
app.engine(
    'handlebars',
    expressHandlebars.engine({
        layoutsDir: __dirname + '/views/layouts',
        defaultLayout: 'main',
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
            formatContent: function (content) {
                const formattedContent = content.replace(/@(\w+)/g, (match, p1) => {
        return `<a href="/profile/${p1}" class="tagged-user-link">@${p1}</a>`;
    });
    return new Handlebars.SafeString(formattedContent);
            },
            split: function (str, delimiter) {
                return str ? str.split(delimiter) : [];
            }
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Configure passport
passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, async (token, tokenSecret, profile, done) => {
    try {
        const hashedGoogleId = profile.id;
        const temporaryUsername = `user_${hashedGoogleId}`;
        const avatar_url = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;

        let user = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', hashedGoogleId);
        if (!user) {
            const finalAvatarUrl = avatar_url || `/avatar/${temporaryUsername}`;
            await db.run(
                'INSERT INTO users (hashedGoogleId, username, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
                [hashedGoogleId, temporaryUsername, finalAvatarUrl, formatDate(new Date())]
            );
            user = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', hashedGoogleId);
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

app.use(
    session({
        secret: 'oneringtorulethemall',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
    })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(async (req, res, next) => {
    res.locals.appName = 'MicroBlogger';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.isAuthenticated();
    res.locals.userId = req.user ? req.user.id : '';
    res.locals.loggedInUsername = req.user ? req.user.username : '';
    if (req.user) {
        const user = await db.get('SELECT avatar_url FROM users WHERE id = ?', req.user.id);
        res.locals.loggedInAvatarUrl = user ? user.avatar_url : '';
    } else {
        res.locals.loggedInAvatarUrl = '';
    }
    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.get('/', async (req, res) => {
    const sortBy = req.query.sortBy || 'timestamp'; // Default sort by timestamp
    const userId = req.user ? req.user.id : null;
    const posts = await getPosts(req.session.userId, sortBy);
    const user = req.user || {};
    res.render('home', { 
        posts, 
        user,
        loggedIn: req.isAuthenticated(),
        loggedInUsername: user.username,
        userId: req.user ? req.user.id : '',
        showNav: true,
        showAvatar: req.isAuthenticated(),
        sortBy
    });
});

// Google Login Route
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google OAuth Callback Route
app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        if (req.user.username.startsWith('user_')) {
            return res.redirect('/registerUsername');
        }
        req.session.userId = req.user.id;
        req.session.loggedIn = true;
        req.session.loggedInUsername = req.user.username;
        req.session.save(err => {
            if (err) {
                return res.status(500).render('error', { message: 'Failed to save session.' });
            }
            res.redirect('/');
        });
    }
);

app.get('/registerUsername', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    res.render('registerUsername', { showNav: false, showAvatar: false });
});


app.post('/registerUsername', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }

    const { username } = req.body;
    const hashedGoogleId = req.user.hashedGoogleId;

    if (/\s/.test(username)) {
        return res.render('registerUsername', { error: 'Usernames cannot contain spaces and must be a single word.' });
    }

    const existingUser = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (existingUser) {
        return res.render('registerUsername', { error: 'Username is already taken.' });
    }

    await db.run(
        'UPDATE users SET username = ? WHERE hashedGoogleId = ?',
        [username, hashedGoogleId]
    );

    const updatedUser = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', hashedGoogleId);
    req.login(updatedUser, (err) => {
        if (err) {
            return res.status(500).render('error', { message: 'Failed to log in after registration.' });
        }
        req.session.userId = updatedUser.id;
        req.session.loggedIn = true;
        req.session.loggedInUsername = updatedUser.username;
        req.session.save(err => {
            if (err) {
                return res.status(500).render('error', { message: 'Failed to save session.' });
            }
            res.redirect('/');
        });
    });
});

app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

app.get('/error', (req, res) => {
    res.render('error');
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).render('error', { message: 'Failed to log out.' });
            }
            res.redirect('/googleLogout');
        });
    });
});

app.get('/googleLogout', (req, res) => {
    res.render('googleLogout');
});

app.get('/logoutCallback', (req, res) => {
    res.render('logoutCallback');
});

app.post('/posts', upload.single('image'), async (req, res) => {
    const { title, content } = req.body;
    const user = req.user;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (title && content && user) {
        await addPost(title, content, user, imageUrl);
        res.redirect('/');
    } else {
        res.status(400).render('error', { message: 'Invalid post data' });
    }
});

app.post('/delete/:id', isAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const user = await getCurrentUser(req);

    try {
        const post = await db.get('SELECT * FROM posts WHERE id = ?', postId);

        if (post && post.username === user.username) {
            await db.run('DELETE FROM posts WHERE id = ?', postId);
            res.redirect('/');
        } else {
            res.status(403).render('error', { message: 'You are not authorized to delete this post' });
        }
    } catch (err) {
        console.error('Error deleting post:', err);
        res.status(500).render('error', { message: 'An error occurred while trying to delete the post.' });
    }
});

app.post('/like/:id', isAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const userId = req.session.userId;

    if (!userId) {
        return res.status(403).json({ success: false, message: 'User not logged in' });
    }

    try {
        const post = await db.get('SELECT * FROM posts WHERE id = ?', postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        
        const userLike = await db.get('SELECT * FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
        if (userLike) {
            // User already liked the post, so unlike it
            await db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
            await db.run('UPDATE posts SET likes = likes - 1 WHERE id = ?', postId);
            const updatedPost = await db.get('SELECT * FROM posts WHERE id = ?', postId);
            res.json({ success: true, likes: updatedPost.likes, liked: false });
        } else {
            // User has not liked the post, so like it
            await db.run('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
            await db.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', postId);
            const updatedPost = await db.get('SELECT * FROM posts WHERE id = ?', postId);
            res.json({ success: true, likes: updatedPost.likes, liked: true });
        }
    } catch (err) {
        console.error('Error updating likes:', err);
        res.status(500).json({ success: false, message: 'An error occurred while updating likes.' });
    }
});

app.get('/profile', isAuthenticated, renderProfile);

app.get('/profile/:username', async (req, res) => {
    const username = req.params.username;
    const profileUser = await db.get('SELECT * FROM users WHERE username = ?', username);
    const loggedInUser = req.user;
    if (profileUser) {
        const userPosts = await db.all('SELECT posts.*, users.avatar_url FROM posts JOIN users ON posts.username = users.username WHERE posts.username = ?', profileUser.username);
        res.render('profile', { 
            profileUser, 
            posts: userPosts,
            loggedIn: req.isAuthenticated(),
            loggedInUsername: loggedInUser ? loggedInUser.username : '',
            loggedInAvatarUrl: loggedInUser ? loggedInUser.avatar_url : '',
            userId: loggedInUser ? loggedInUser.id : '',
            showAvatar: req.isAuthenticated(),
            showNav: true,
            userExists: true
        });
    } else {
        res.render('profile', {
            userExists: false,
            showNav: true,
            loggedIn: req.isAuthenticated(),
            loggedInUsername: loggedInUser ? loggedInUser.username : '',
            loggedInAvatarUrl: loggedInUser ? loggedInUser.avatar_url : '',
            userId: loggedInUser ? loggedInUser.id : '',
            showAvatar: req.isAuthenticated()
        });
    }
});

app.get('/avatar/:username', handleAvatar);

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

async function getCurrentUser(req) {
    if (req.session.passport && req.session.passport.user) {
        return await db.get('SELECT * FROM users WHERE id = ?', req.session.passport.user);
    }
    return null;
}

async function getPosts(userId, sortBy = 'timestamp') {
    let orderByClause = 'ORDER BY posts.timestamp DESC';

    if (sortBy === 'likes') {
        orderByClause = 'ORDER BY posts.likes DESC';
    }

    const posts = await db.all(`
        SELECT 
            posts.id, 
            posts.title, 
            posts.content, 
            posts.username, 
            posts.timestamp, 
            posts.likes,
            posts.image_url,
            users.avatar_url,
            EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = ?) AS liked,
            GROUP_CONCAT(tagged_users.username) AS tagged_users
        FROM posts
        JOIN users ON posts.username = users.username
        LEFT JOIN tags ON posts.id = tags.post_id
        LEFT JOIN users AS tagged_users ON tags.tagged_user_id = tagged_users.id
        GROUP BY posts.id
        ${orderByClause}
    `, [userId]);

    return posts;
}

async function getUserPosts(userId, username) {
    const posts = await db.all(`
        SELECT 
            posts.id, 
            posts.title, 
            posts.content, 
            posts.username, 
            posts.timestamp, 
            posts.likes,
            posts.image_url,
            users.avatar_url,
            EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = ?) AS liked,
            GROUP_CONCAT(tagged_users.username) AS tagged_users
        FROM posts
        JOIN users ON posts.username = users.username
        LEFT JOIN tags ON posts.id = tags.post_id
        LEFT JOIN users AS tagged_users ON tags.tagged_user_id = tagged_users.id
        WHERE posts.username = ?
        GROUP BY posts.id
        ORDER BY posts.timestamp DESC
    `, [userId, username]);

    return posts;
}

async function addPost(title, content, user, imageUrl) {
    const timestamp = formatDate(new Date());

    // Insert the post and get the post ID
    const result = await db.run(
        'INSERT INTO posts (title, content, username, timestamp, likes, image_url) VALUES (?, ?, ?, ?, 0, ?)',
        [title, content, user.username, timestamp, imageUrl]
    );

    const postId = result.lastID;

    // Extract tags from the content
    const taggedUsernames = content.match(/@(\w+)/g);
    if (taggedUsernames) {
        const uniqueTaggedUsernames = [...new Set(taggedUsernames.map(tag => tag.substring(1)))];

        // Insert tags into the tags table
        for (const username of uniqueTaggedUsernames) {
            const taggedUser = await db.get('SELECT id FROM users WHERE username = ?', username);
            if (taggedUser) {
                await db.run(
                    'INSERT INTO tags (post_id, tagged_user_id) VALUES (?, ?)',
                    [postId, taggedUser.id]
                );
            }
        }
    }
}

async function renderProfile(req, res) {
    const user = await getCurrentUser(req);
    if (user) {
        const userPosts = await db.all('SELECT posts.*, users.avatar_url FROM posts JOIN users ON posts.username = users.username WHERE posts.username = ?', user.username);
        res.render('profile', { 
            user, 
            posts: userPosts,
            loggedIn: req.isAuthenticated(),
            loggedInUsername: user.username,
            userId: req.session.userId, 
            showAvatar: req.isAuthenticated(),
            showNav: true
        });
    } else {
        res.status(404).render('error', { message: 'User not found' });
    }
}

async function handleAvatar(req, res) {
    const username = req.params.username;
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (user) {
        const avatar = generateAvatar(username[0], user.avatarColor);
        res.type('png').send(avatar);
    } else {
        res.status(404).send('User not found');
    }
}

// Add missing functions

function generateAvatar(letter, color, width = 100, height = 100) {
    const canvasInstance = canvas.createCanvas(width, height);
    const ctx = canvasInstance.getContext('2d');

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    ctx.font = 'bold 50px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter.toUpperCase(), width / 2, height / 2);

    return canvasInstance.toBuffer('image/png');
}

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'User not authenticated' });
    }
}

function formatDate(date) {
    const pad = (num) => num.toString().padStart(2, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
