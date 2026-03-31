# 💬 ChatWave — Real-Time Chat Application

A full-featured, production-ready real-time chat app built with Node.js, Socket.IO, MongoDB Atlas, and Bootstrap.

---

## ✨ Features

- **Authentication** — Register & login with bcrypt password hashing + JWT sessions
- **Real-time messaging** — Socket.IO for instant delivery with no page refresh
- **Direct Messages** — Search any user and start a private conversation
- **Group Chats** — Create named groups with multiple members
- **Typing indicators** — Live "typing…" indicator shown to others
- **Online / offline status** — Green dot when a user is active, last-seen time when away
- **Read receipts** — Double-tick turns purple when the other person has read your message
- **Unread badges** — Conversation list shows unread message count
- **Emoji picker** — 300+ emojis across 6 categories with one-click insert
- **Image sharing** — Attach and send images (up to 10 MB) with a full-screen lightbox viewer
- **Notification toasts** — In-app banner + chime for new messages from other conversations
- **Profile page** — Update username, bio, avatar photo, and password
- **Responsive UI** — Works on desktop and mobile (sidebar hides on small screens)
- **Page-title badge** — Unread count shown in browser tab
- **Auto-scroll & scroll-to-bottom button** — Smart scroll management

---

## 🗂 Project Structure

```
chat-app/
├── server.js                 # Express + Socket.IO entry point
├── package.json
├── render.yaml               # One-click Render deployment config
├── .env.example              # Environment variable template
├── .gitignore
│
├── models/
│   ├── User.js               # Schema with bcrypt pre-save hook
│   ├── Conversation.js       # DMs + groups
│   └── Message.js            # Text / image / emoji messages
│
├── routes/
│   ├── auth.js               # POST /register  POST /login  GET /me
│   ├── users.js              # GET /search  GET /:id  PUT /profile
│   ├── conversations.js      # GET /  POST /direct  POST /group  DELETE /:id
│   └── messages.js           # GET /:convId  POST /upload
│
├── middleware/
│   └── auth.js               # JWT Bearer token verification
│
├── uploads/
│   ├── avatars/              # User profile photos (served as /uploads/avatars/*)
│   └── images/               # Chat image attachments
│
└── public/
    ├── index.html            # Login / Register page
    ├── chat.html             # Main chat dashboard
    ├── profile.html          # Profile settings page
    ├── img/
    │   └── default-avatar.svg
    ├── css/
    │   └── style.css         # Full custom dark-theme CSS
    └── js/
        └── chat.js           # All client-side Socket.IO + UI logic
```

---

## 🚀 Quick Start (Local)

### Prerequisites
- Node.js ≥ 18
- A [MongoDB Atlas](https://cloud.mongodb.com) account (free tier works great)

### 1 — Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/chatwave.git
cd chatwave
npm install
```

### 2 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
MONGODB_URI=mongodb+srv://alice:password@cluster0.abcde.mongodb.net/chatapp?retryWrites=true&w=majority
JWT_SECRET=any_long_random_string_here
JWT_EXPIRES=7d
PORT=3000
```

> **Tip:** Generate a strong JWT_SECRET with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 3 — Run the dev server

```bash
npm run dev      # nodemon (auto-restarts on file changes)
# or
npm start        # plain node
```

Open `http://localhost:3000` — register two accounts in different tabs and chat!

---

## ☁️ Deploy to Render (Free)

### Step 1 — MongoDB Atlas

1. Create a free **M0 cluster** at [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Database Access → Add New User** — note the username & password
3. **Network Access → Add IP Address** → enter `0.0.0.0/0` (allow all — Render uses dynamic IPs)
4. **Connect → Drivers** → copy the connection string
   ```
   mongodb+srv://alice:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<password>` with your actual password and add `/chatapp` before the `?`:
   ```
   mongodb+srv://alice:secret@cluster0.abcde.mongodb.net/chatapp?retryWrites=true&w=majority
   ```

### Step 2 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit — ChatWave"
git remote add origin https://github.com/YOUR_USERNAME/chatwave.git
git push -u origin main
```

### Step 3 — Deploy on Render

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub account and select the `chatwave` repo
3. Render reads `render.yaml` automatically — you'll see the service name `chatwave-app`
4. Click **Advanced** → **Add Environment Variable**:

   | Key | Value |
   |-----|-------|
   | `MONGODB_URI` | Your Atlas URI from Step 1 |
   | `JWT_SECRET` | A 32-char random string |

5. Click **Create Web Service** — deployment takes ~2 minutes
6. Your app is live at `https://chatwave-app.onrender.com` 🎉

> **Note:** Render's free tier spins down after 15 min of inactivity. The first request after sleep takes ~30 seconds. Upgrade to Starter ($7/mo) for always-on.

---

## 🔌 API Reference

### Auth
| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/api/auth/register` | `{ username, email, password }` | — |
| POST | `/api/auth/login` | `{ email, password }` | — |
| GET | `/api/auth/me` | — | ✅ |

### Users
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/users/search?q=term` | Find users by username/email |
| GET | `/api/users/:id` | Get user profile |
| PUT | `/api/users/profile` | Update profile (multipart form) |

### Conversations
| Method | Path | Body |
|--------|------|------|
| GET | `/api/conversations` | All conversations for current user |
| POST | `/api/conversations/direct` | `{ participantId }` |
| POST | `/api/conversations/group` | `{ groupName, participantIds[] }` |
| DELETE | `/api/conversations/:id` | — |

### Messages
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/messages/:conversationId` | `?page=1&limit=50` |
| POST | `/api/messages/upload` | Multipart file, returns `{ imageUrl }` |

### Socket.IO Events

**Client → Server**
| Event | Payload |
|-------|---------|
| `joinConversation` | `conversationId` |
| `leaveConversation` | `conversationId` |
| `sendMessage` | `{ conversationId, content, type, imageUrl? }` |
| `typing` | `{ conversationId }` |
| `stopTyping` | `{ conversationId }` |
| `markRead` | `{ conversationId }` |

**Server → Client**
| Event | Payload |
|-------|---------|
| `newMessage` | Full message object (populated) |
| `typing` | `{ userId, conversationId }` |
| `stopTyping` | `{ userId, conversationId }` |
| `userStatus` | `{ userId, isOnline, lastSeen? }` |
| `messagesRead` | `{ conversationId, userId }` |
| `notification` | `{ conversationId, senderName, preview, … }` |

---

## 🔒 Security Notes

- Passwords are hashed with **bcrypt** (cost factor 12) — never stored in plain text
- JWTs are verified on every protected API call and Socket connection
- File uploads are validated by MIME type (images only) and capped at 5 MB (avatars) / 10 MB (chat images)
- Participants are verified before messages are stored or delivered
- CORS is enabled for development; restrict `origin` in `server.js` for production if needed

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Real-time | Socket.IO 4 |
| Database | MongoDB + Mongoose 8 |
| Auth | JWT + bcryptjs |
| File uploads | Multer |
| Frontend | Vanilla JS + Bootstrap 5 + Font Awesome 6 |
| Deployment | Render (PaaS) |
| DB Hosting | MongoDB Atlas |

---

## 📄 License

MIT — free to use, modify, and deploy.
