const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


const app = express();
const PORT = 3000;

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

// Set up Handlebars view engine with custom helpers
//

app.engine(
    'handlebars',
    expressHandlebars.engine({
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
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: 'oneringtorulethemall',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
    })
);

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use((req, res, next) => {
    const user = getCurrentUser(req);
    res.locals.appName = 'MicroBlogger';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    res.locals.loggedInUsername = user ? user.username : ''; // Add loggedInUsername to locals
    res.locals.likesMap = getLikesMap();
    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', (req, res) => {
    const posts = getPosts();
    const user = getCurrentUser(req) || {};
    const likesMap = getLikesMap();
    res.render('home', { 
        posts, 
        user,
        loggedIn: req.session.loggedIn, // Add loggedIn to context
        loggedInUsername: user.username,
        userId: req.session.userId, // Add userId to context
        likesMap
    });
});

// Register GET route is used for error response from registration
//
app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

// Login route GET route is used for error response from login
//
app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Error route: render error page
//
app.get('/error', (req, res) => {
    res.render('error');
});

// Additional routes that you must implement

app.post('/posts', (req, res) => {
    const { title, content } = req.body;
    const user = getCurrentUser(req);
    if (title && content && user) {
        addPost(title, content, user);
        res.redirect('/');
    } else {
        res.status(400).render('error', { message: 'Invalid post data' });
    }
});

app.post('/like/:id', updatePostLikes);

app.get('/profile', isAuthenticated, renderProfile);

app.get('/avatar/:username', handleAvatar);

app.post('/register', registerUser);

app.post('/login', loginUser);

app.get('/logout', logoutUser);

app.post('/delete/:id', isAuthenticated, (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const postIndex = posts.findIndex(p => p.id === postId);
    const user = getCurrentUser(req);
    if (postIndex !== -1 && posts[postIndex].username === user.username) {
        posts.splice(postIndex, 1);
        res.redirect('/');
    } else {
        res.status(403).render('error', { message: 'You are not authorized to delete this post' });
    }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Example data for posts and users
let posts = [
    {
        id: 1,
        title: 'Exploring Hidden Gems in Europe',
        content: 'Just got back from an incredible trip through Europe. Visited some lesser-known spots that are truly breathtaking!',
        username: 'TravelGuru',
        timestamp: '2024-05-02 08:30',
        likes: 0,
        likesBy: {}
    },
    {
        id: 2,
        title: 'The Ultimate Guide to Homemade Pasta',
        content: 'Learned how to make pasta from scratch, and it’s easier than you think. Sharing my favorite recipes and tips.',
        username: 'FoodieFanatic',
        timestamp: '2024-05-02 09:45',
        likes: 0,
        likesBy: {}
    },
    {
        id: 3,
        title: 'Top 5 Gadgets to Watch Out for in 2024',
        content: 'Tech enthusiasts, here’s my list of the top 5 gadgets to look out for in 2024. Let me know your thoughts!',
        username: 'TechSage',
        timestamp: '2024-05-02 11:00',
        likes: 0,
        likesBy: {}
    },
    {
        id: 4,
        title: 'Sustainable Living: Easy Swaps You Can Make Today',
        content: 'Making the shift to sustainable living is simpler than it seems. Sharing some easy swaps to get you started.',
        username: 'EcoWarrior',
        timestamp: '2024-05-02 13:00',
        likes: 0,
        likesBy: {}
    }
];
let users = [
    {
        id: 1,
        username: 'TravelGuru',
        avatar_url: undefined,
        memberSince: '2024-05-01 10:00'
    },
    {
        id: 2,
        username: 'FoodieFanatic',
        avatar_url: undefined,
        memberSince: '2024-05-01 11:30'
    },
    {
        id: 3,
        username: 'TechSage',
        avatar_url: undefined,
        memberSince: '2024-05-01 12:15'
    },
    {
        id: 4,
        username: 'EcoWarrior',
        avatar_url: undefined,
        memberSince: '2024-05-01 13:45'
    }
];

let likes = {};

// Function to find a user by username
function findUserByUsername(username) {
    return users.find(user => user.username === username);
}

// Function to find a user by user ID
function findUserById(userId) {
    return users.find(user => user.id === userId);
}

// Function to add a new user
function addUser(username) {
    const newUser = {
        id: users.length + 1,
        username: username,
        avatar_url: `/avatar/${username}`,
        memberSince: formatDate(new Date())
    };
    users.push(newUser);
    return newUser;
}

// Format Date
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() is zero-based
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Function to register a user
function registerUser(req, res) {
    const { username } = req.body;
    if (username && !findUserByUsername(username)) {
        const newUser = addUser(username);
        req.session.userId = newUser.id;
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        res.status(400).render('loginRegister', { regError: 'Username already exists or is invalid' });
    }
}

// Function to login a user
function loginUser(req, res) {
    const { username } = req.body;
    const user = findUserByUsername(username);
    if (user) {
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        res.status(400).render('loginRegister', { loginError: 'Invalid username' });
    }
}

// Function to logout a user
function logoutUser(req, res) {
    req.session.destroy(err => {
        if (err) {
            res.status(500).render('error', { message: 'Error logging out' });
        } else {
            res.redirect('/');
        }
    });
}

// Function to render the profile page
function renderProfile(req, res) {
    const user = getCurrentUser(req);
    const likesMap = getLikesMap();
    if (user) {
        const userPosts = posts.filter(post => post.username === user.username);
        res.render('profile', { 
            user, 
            posts: userPosts,
            loggedIn: req.session.loggedIn, // Add loggedIn to context
            loggedInUsername: user.username,
            userId: req.session.userId, // Add userId to context
            likesMap
        });
    } else {
        res.status(404).render('error', { message: 'User not found' });
    }
}

// Function to update post likes
function updatePostLikes(req, res) {
    const postId = parseInt(req.params.id, 10);
    const post = posts.find(post => post.id === postId);
    const userId = req.session.userId;

    if (!post) {
        return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (!likes[postId]) {
        likes[postId] = new Set();
    }

    if (likes[postId].has(userId)) {
        post.likes -= 1;
        likes[postId].delete(userId);
        res.json({ success: true, likes: post.likes, liked: false });
    } else {
        post.likes += 1;
        likes[postId].add(userId);
        res.json({ success: true, likes: post.likes, liked: true });
    }
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    const username = req.params.username;
    const avatar = generateAvatar(username[0]);
    res.type('png').send(avatar);
}

// Function to get the current user from session
function getCurrentUser(req) {
    return findUserById(req.session.userId);
}

// Function to get all posts, sorted by latest first
function getPosts() {
    return posts.slice().reverse();
}

// Function to add a new post
function addPost(title, content, user) {
    const newPost = {
        id: posts.length + 1,
        title: title,
        content: content,
        username: user.username,
        userId: user.id,
        timestamp: formatDate(new Date()),
        likes: 0,
    };
    posts.push(newPost);
}

function getLikesMap() {
    // This should return a map of post IDs to user IDs who liked the posts
    // Example format:
    // { 1: { 1: true, 2: true }, 2: { 1: true } }
    const likesMap = {};
    posts.forEach(post => {
        likesMap[post.id] = post.likesBy || {};
    });
    return likesMap;
}

// Function to generate an image avatar
function generateAvatar(letter, width = 100, height = 100) {
    const canvasInstance = canvas.createCanvas(width, height);
    const ctx = canvasInstance.getContext('2d');

    const colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1'];
    const color = colors[letter.charCodeAt(0) % colors.length];

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    ctx.font = 'bold 50px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter.toUpperCase(), width / 2, height / 2);

    return canvasInstance.toBuffer('image/png');
}
