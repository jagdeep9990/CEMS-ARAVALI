# CEMS – Aravali College Event Management System

Event portal for Aravali College of Engineering and Management: students browse events and book a ticket; organizers manage everything from an admin panel.

## Run it

Requires Node.js 18 or newer.

```bash
cd cems
npm install
npm start
```

- Website: http://localhost:3000
- Admin panel: http://localhost:3000/admin.html (default password `admin123`)

Change the password (do this before putting it online):

```bash
# Mac / Linux
ADMIN_PASSWORD=your-strong-password npm start
# Windows PowerShell
$env:ADMIN_PASSWORD="your-strong-password"; npm start
```

Use `PORT=8080` the same way to change the port.

## Features

**Students**
- Event cards with category colours, date badge, live seat bar, "featured" flag
- Category filters and search
- Countdown to the next event
- Registration form with ticket code + QR code, printable ticket
- "My Tickets" lookup by email, with cancel option
- Duplicate-registration and full-event protection

**Organizers (admin panel)**
- Dashboard: totals, registrations per event / branch / last 7 days
- Create, edit, delete events (image URL optional)
- View and remove registrations, filter by event, export CSV
- Check-in screen: type or paste a ticket code at the gate

## Project layout

```
server.js            Express API + JSON-file storage
data/db.json         Created on first run (events + registrations)
public/index.html    Student site
public/admin.html    Organizer panel
public/css/style.css Shared styles (your blue/amber theme)
public/js/app.js     Student site logic
public/js/admin.js   Admin logic
```

The 6 starter events are sample data – edit or delete them in the admin panel. To reset everything, stop the server and delete `data/db.json`.

## API summary

Public: `GET /api/events`, `GET /api/events/:id`, `POST /api/register`, `GET /api/my-registrations?email=`, `POST /api/cancel`

Admin (Bearer token from `POST /api/admin/login`): `GET /api/admin/stats`, `GET|POST /api/admin/events`, `PUT|DELETE /api/admin/events/:id`, `GET /api/admin/registrations`, `DELETE /api/admin/registrations/:id`, `POST /api/admin/checkin`, `GET /api/admin/export.csv`

## Notes

- Storage is a JSON file, which is fine for a college site with a few thousand registrations. If you later need a real database, only the `db` reads/writes in `server.js` need replacing.
- Admin login tokens are kept in memory, so restarting the server signs organizers out.
- The QR code library loads from a CDN; without internet the ticket still shows the text code.
- This does not send confirmation emails yet. `POST /api/register` in `server.js` is where to add that (e.g. with Nodemailer).
