Dast Rast - Windows portable run

This package does NOT need npm install.

Requirements:
- Node.js installed. Recommended: Node.js LTS 22 or 20.
- If npm install hangs on your system, ignore npm and use this portable version.

Run:
1) Extract the zip.
2) Double click RUN-WINDOWS-NO-INSTALL.bat
   OR open CMD in this folder and run:
   node server-standalone.js
3) Open:
   http://localhost:8787

Default admin:
Email: admin@dastrast.local
Password: Admin12345

Important:
- AI API token is stored fully on the server, but never shown back in the admin UI for security.
- If a token is already saved, the field stays empty and shows that a token exists. To change it, enter a new token and save.
- Local Persian parser works without any AI API.

Test from phone:
1) Make sure PC and phone are on the same Wi-Fi.
2) On Windows CMD run:
   ipconfig
3) Find your IPv4 Address, for example 192.168.1.35
4) On phone open:
   http://192.168.1.35:8787
5) If it does not open, allow Node.js in Windows Firewall or temporarily disable firewall for test.

Data is saved in:
data/db.json
