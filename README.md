# Popin — Anonymous Nickname Chat

Nickname-based anonymous random chat website. No login/signup — user sirf nickname nakhi ne direct chat kari sake. Admin panel sathe (online users, active chats, kick/ban, reports).

## Su Che Ama

- `server.js` — Backend (Express + Socket.io). Random pairing, chat relay, admin APIs.
- `public/index.html` + `chat.js` + `style.css` — User-facing chat website.
- `public/admin.html` + `admin.js` — Admin dashboard (password-protected).
- No database — bilkul in-memory (RAM ma) chale che. Server restart thay to sab data (users/reports) clear thai jaay. Production mate later database (MongoDB) add kari shakay.

## Local ma Test Karva Mate (Live Karya Vagar)

1. **Node.js install** hovu joiye (v18+ recommended). Check karo: `node -v`

2. Terminal ma project folder ma jaao:
   ```
   cd anon-chat
   ```

3. Dependencies install karo:
   ```
   npm install
   ```

4. `.env.example` ne copy kari `.env` banaao ane password change karo:
   ```
   cp .env.example .env
   ```
   Pachi `.env` file kholi ne `ADMIN_PASSWORD` badlo (default: `changeme123`).

5. Server start karo:
   ```
   npm start
   ```

6. Browser ma kholo:
   - **User chat site:** http://localhost:3000
   - **Admin panel:** http://localhost:3000/admin.html (password poochhse)

Test karva mate 2 alag browser tabs (ek normal, ek incognito) ma site kholo — 2 different nicknames nakho, "Start Chatting" dabaao — bannem random match thai jaase kem ke bas bija online koi che nathi.

## Jyare Live Karvu Hoy (Future)

Jyare tame ready hoy, aa steps follow karjo:

1. Code ne GitHub repo ma push karo
2. Render.com / Railway.app par account banaao, GitHub repo connect karo
3. Environment variables (`ADMIN_PASSWORD`, `SESSION_SECRET`) tya set karo — `.env` file upload NA karta, deploy platform na dashboard ma manually nakho
4. Deploy dabaao — free subdomain (jaise `popin-chat.onrender.com`) malse
5. Pachi ichcho to custom domain jodi shakso

## Security Notes (Live Karta Pehla Dhyan Rakhjo)

- `ADMIN_PASSWORD` ane `SESSION_SECRET` **avashya badlo** — default values production ma use na karta
- `BLOCKED_WORDS` list (`server.js` ma top par) ma tamara jaruriyat mujab bad words add karo
- Aa version ma content moderation basic che (sirf text filter) — image/video sharing add karo to nudity detection jevu vadharanu padse
- Legal pages (Terms of Use, Privacy Policy, 18+ disclaimer) add karva jaruri che jo public launch karo to
- IP addresses admin panel ma dekhaay che moderation mate — aa data users ne dekhadta nahi

## Aagad Su Add Kari Shakay (Future Ideas)

- Database (MongoDB/Supabase) — persistent ban list, report history
- Video/voice chat (WebRTC)
- Better profanity filter (AI-based)
- Rate limiting (spam prevent karva)
- Interest-based matching (jaise Omegle na "common interests" tags)
