# docusum-ai
Meringkas dokumen Tugas Akhir (TA)

https://docusum.vercel.app/

Jalankan pada terminal:
- setx GOOGLE_API_KEY "AIzaSyAmwg5i1a3j5a1RkWtUvYmCLpqS6Fp58Qk"
- Install segala yang tertera di `requierements.txt`
- Terminal 1 (Backend): `cd backend` lalu `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`
- Terminal 2 (Frontend): `cd frontend` lalu `python -m http.server 5500`
- Buka di browser: http://127.0.0.1:5500/index.html

Catatan: 
- Untuk komentar hanya berfungsi saat aplikasi sudah online, sesuai dengan `base_api/base URL`

Saat ini semua berjalan di render;
- Pada `frontend/result.html` baris 229  `const BASE_API = "https://docusum.onrender.com";`
- Pada `backend/main.py` bari 448 `BASE_URL = "https://docusum.onrender.com"`
