# main.py
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from collections import Counter
import re, os, string, math, asyncio, time
from typing import List, Dict, Any, Tuple, Optional

# Gemini 
import google.generativeai as genai
GEMINI_MODEL = "gemini-2.5-flash"
API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError("GOOGLE_API_KEY belum diset.")
genai.configure(api_key=API_KEY)
_model = genai.GenerativeModel(GEMINI_MODEL)

# Ekspor
from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

# Konfigurasi performa
MAX_CONCURRENCY = 10          
MAX_RETRIES = 4               
RETRY_BASE_DELAY = 0.8       
GEMINI_TIMEOUT = 60          
# Untuk menjaga input tidak kebanyakan, kita compress per-BAB jadi 12k–16k karakter
MAX_INPUT_CHARS = 30000

# Ekstraksi PDF (dengan OCR fallback)
def read_pdf_text(path: str) -> str:
    text = ""
    # 1) PyMuPDF (fitz)
    try:
        import fitz
        doc = fitz.open(path)
        text = "\n".join([p.get_text() for p in doc])
        text = clean_text(text)
        if _enough_text(text):
            return text
    except Exception:
        pass

    # 2) pdfminer
    try:
        from pdfminer.high_level import extract_text
        text = clean_text(extract_text(path))
        if _enough_text(text):
            return text
    except Exception:
        pass

    # 3) PyPDF2
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(path)
        raw = "\n".join([p.extract_text() or "" for p in reader.pages])
        text = clean_text(raw)
        if _enough_text(text):
            return text
    except Exception:
        pass

    # 4) OCR fallback (opsional)
    try:
        from pdf2image import convert_from_path
        import pytesseract
        pages = convert_from_path(path, dpi=300)
        ocr_text = ""
        for pg in pages:
            t = pytesseract.image_to_string(pg, lang="eng+ind")
            ocr_text += t + "\n\n"
        return clean_text(ocr_text)
    except Exception:
        # Jika OCR tidak tersedia, kembalikan yang ada
        return clean_text(text)

def _enough_text(text: str, min_chars: int = 200) -> bool:
    return len((text or "").strip()) >= min_chars

# ===============================
# Cleaning Teks
# ===============================
BLACKBOXES = ["■", "□", "▯", "█", "�"]
SYMBOL_FIX = {
    "° ": "° ", "°C": "°C",
    "–": "-", "—": "-",
}

def clean_text(text: str) -> str:
    if not text:
        return ""
    for b in BLACKBOXES:
        text = text.replace(b, "")
    for k, v in SYMBOL_FIX.items():
        text = text.replace(k, v)

    # gabung kata terpotong di akhir baris: "algo-\nritma" -> "algoritma"
    text = re.sub(r"(\w+)-\s*\n\s*(\w+)", r"\1\2", text, flags=re.UNICODE)

    # normalisasi newline & spasi
    text = text.replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # hilangkan artefak 'n' sisa konversi (contoh: "3.1n" -> "3.1 ")
    text = re.sub(r"(\w)\bn(\s)", r"\1\2", text)

    return text.strip()

# ===============================
# Utility tokenisasi & ekstraktif
# ===============================
STOPWORDS = set("yang dan di ke dari untuk pada adalah dengan dalam ini itu serta juga tidak dapat atau oleh bagi agar sudah akan para sebagai tersebut karena maka sehingga terhadap serta olehnya".split())
PUNCT = str.maketrans("", "", string.punctuation)

def tokenize(text: str):
    return [w for w in text.lower().translate(PUNCT).split() if w not in STOPWORDS and len(w) > 2]

def split_sentences(text: str):
    # pisah saat titik/tanya/seru diikuti huruf/angka/huruf kapital
    sents = re.split(r"(?<=[\.\?\!])\s+(?=[A-Za-z0-9])", text.strip())
    return [s.strip() for s in sents if s.strip()]

def summarize_text_extractive(text: str, max_sent: int = 8) -> str:
    sents = split_sentences(text)
    if not sents:
        return ""
    sent_tokens = [tokenize(s) for s in sents]
    df = Counter()
    for t in sent_tokens:
        df.update(set(t))
    N = len(sents)
    scores = []
    for i, toks in enumerate(sent_tokens):
        # simple TF * IDF-like
        score = sum(
            (cnt / (1 + len(toks))) * (math.log((N + 1) / (1 + df[w])) + 1)
            for w, cnt in Counter(toks).items()
        )
        if i < max(3, int(N * 0.1)):  # bonus kalimat awal (context)
            score *= 1.15
        scores.append(score)
    top_idx = sorted(range(N), key=lambda i: scores[i], reverse=True)[:max_sent]
    return " ".join([sents[i] for i in sorted(top_idx)])

# ===============================
# Split per BAB
# ===============================
BAB_PATTERN = re.compile(r"(BAB\s+[IVXLC]+\s*[^\n]*)", flags=re.IGNORECASE)

def split_by_bab(text: str):
    # 1. Buang semua sebelum BAB I
    match = re.search(r"(BAB\s+I\b.*)", text, flags=re.IGNORECASE | re.DOTALL)
    if match:
        text = match.group(1)

    # 2. Hapus baris daftar isi dengan titik dan nomor
    text = re.sub(r"^.*\.+\s*\d+\s*$", "", text, flags=re.MULTILINE)

    # Hapus header "DAFTAR ISI", "TABLE OF CONTENTS", dst.
    text = re.sub(r"DAFTAR\s+ISI|TABLE\s+OF\s+CONTENTS", "", text, flags=re.IGNORECASE)

    # 3. Split per BAB
    parts = BAB_PATTERN.split(text)
    out = []

    for i in range(1, len(parts), 2):
        title = parts[i].strip()
        content = parts[i + 1] if i + 1 < len(parts) else ""
        out.append({"judul": title, "isi": content})

    return out

# Gemini
SUM_PROMPT_TEMPLATE = """\
Ringkas isi berikut dalam 2–3 paragraf bergaya akademik yang jelas, menjaga istilah teknis, dan tetap padat.
Gunakan BAHASA YANG SAMA dengan teks masukan (jika teks berbahasa Indonesia, tulis ringkasan Indonesia; jika Inggris, tulis Inggris).
Hindari bullet point, buat paragraf koheren, tidak bertele-tele, dan jangan menambah fakta baru.
TEKS:
\"\"\"{content}\"\"\""""

def _gemini_call_sync(prompt: str) -> str:
    # Panggilan sinkron; akan dibungkus async dengan to_thread
    resp = _model.generate_content(
        prompt,
        request_options={"timeout": GEMINI_TIMEOUT},
        generation_config={"response_mime_type": "text/plain"},
    )
    return (getattr(resp, "text", "") or "").strip()

async def gemini_summarize_async(content: str, semaphore: asyncio.Semaphore) -> str:
    # Retry + backoff + concurrency guard
    prompt = SUM_PROMPT_TEMPLATE.format(content=content)
    attempt = 0
    while True:
        attempt += 1
        try:
            async with semaphore:
                # jalankan sync di thread pool agar paralel
                result = await asyncio.to_thread(_gemini_call_sync, prompt)
            if result:
                return result
            # kosong? treat as error untuk retry
            raise RuntimeError("Empty response from Gemini.")
        except Exception as e:
            if attempt >= MAX_RETRIES:
                # fallback terakhir: kembalikan ekstraktif agar tetap ada output
                return summarize_text_extractive(content, max_sent=7)
            # rate limit / timeout → exponential backoff
            delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
            # batasi delay maksimum
            delay = min(delay, 8.0)
            # beri jitter kecil
            time.sleep(delay)

# Pre-Compress per BAB
def compress_for_prompt(text: str, max_chars: int = MAX_INPUT_CHARS) -> str:
    """
    Kompres teks panjang jadi versi lebih pendek tapi tetap representatif.
    Pendekatan: ekstraktif (mengambil kalimat penting) + pemotongan aman.
    """
    import re
    from heapq import nlargest
    from collections import Counter

    # --- 1. Bersihkan teks ---
    text = re.sub(r'\s+', ' ', text)
    sentences = re.split(r'(?<=[.!?]) +', text)
    if len(sentences) <= 12:
        return text[:max_chars]

    # --- 2. Tentukan jumlah kalimat target dinamis ---
    # Semakin panjang teks, semakin banyak kalimat yang diambil
    base_k = 16 + min(8, len(text) // 15000)  # 16–24 kalimat

    # --- 3. Skor sederhana berdasarkan frekuensi kata penting ---
    words = re.findall(r'\w+', text.lower())
    freq = Counter(words)
    score = {s: sum(freq[w.lower()] for w in re.findall(r'\w+', s)) for s in sentences}

    extract = " ".join(nlargest(base_k, sentences, key=lambda s: score.get(s, 0)))

    # --- 4. Potong dengan aman jika terlalu panjang ---
    if len(extract) > max_chars:
        extract = extract[:max_chars]
        # pastikan tidak terpotong di tengah kalimat
        last_dot = extract.rfind('.')
        if last_dot != -1:
            extract = extract[:last_dot + 1]

    return extract.strip()

# Ringkas Per BAB (paralel)
async def summarize_sections_parallel(sections: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def _process(sec):
        isi = sec["isi"].strip()

        # Pisahkan per paragraf
        paragraf = [p.strip() for p in isi.split("\n") if p.strip()]

        # Buang paragraf sampah di awal (yang kependekan/berantakan)
        paragraf_bersih = [p for p in paragraf if len(p) > 40]

        # Ambil isi penting saja
        if len(paragraf_bersih) >= 2:
            isi_bersih = "\n".join(paragraf_bersih[:6])  # ambil 6 paragraf penting
        else:
            return {"judul": sec["judul"], "ringkasan_bab": ""}  # tetap tampil, tapi kosong

        compressed = compress_for_prompt(isi_bersih, MAX_INPUT_CHARS)
        summary = await gemini_summarize_async(compressed, semaphore)
        return {"judul": sec["judul"], "ringkasan_bab": summary}

    tasks = [asyncio.create_task(_process(sec)) for sec in sections]
    results = await asyncio.gather(*tasks)
    return results

async def summarize_pdf_per_bab(path: str):
    raw = read_pdf_text(path)
    sections = split_by_bab(raw)
    results = await summarize_sections_parallel(sections)
    return {"file": os.path.basename(path), "sections": results}

# Export DOCX & PDF 
def export_all(data, out_docx, out_pdf):
    # DOCX
    doc = Document()
    doc.add_heading("Ringkasan Per Bab (Gemini 2.5 Flash)", 0)
    doc.add_paragraph(f"File: {data['file']}")
    for sec in data["sections"]:
        doc.add_heading(sec["judul"], level=1)
        doc.add_paragraph(sec["ringkasan_bab"] or "")
    doc.save(out_docx)

    # PDF
    styles = getSampleStyleSheet()
    pdf = SimpleDocTemplate(out_pdf, pagesize=A4)
    elements = []
    elements.append(Paragraph("Ringkasan Per Bab (Gemini 2.5 Flash)", styles['Title']))
    elements.append(Paragraph(f"File: {data['file']}", styles['Normal']))
    elements.append(Spacer(1, 12))
    for sec in data["sections"]:
        elements.append(Paragraph(sec["judul"], styles['Heading2']))
        elements.append(Paragraph(sec["ringkasan_bab"] or "", styles['Normal']))
        elements.append(Spacer(1, 12))
    pdf.build(elements)

# FastAPI
app = FastAPI(title="DocuSum AI (Gemini) — Balanced Fast",
              description="Ringkasan Per Bab rapi (PDF + DOCX), paralel, 2–3 paragraf, bahasa mengikuti dokumen.",
              version="8.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # batasi di production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Hanya file PDF diperbolehkan.")
    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as f:
        f.write(await file.read())

    try:
        hasil = await summarize_pdf_per_bab(str(file_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal meringkas: {e}")

    docx_path = str(file_path.with_suffix(".docx"))
    pdf_path = str(file_path.with_suffix(".summary.pdf"))
    try:
        export_all(hasil, docx_path, pdf_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal ekspor: {e}")

    return {
        "success": True,
        "download_docx": f"/api/download/{Path(docx_path).name}",
        "download_pdf": f"/api/download/{Path(pdf_path).name}"
    }

@app.get("/api/download/{filename}")
async def download_file(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    return FileResponse(file_path, filename=filename)

if __name__ == "__main__":
    import uvicorn
    # Gunakan reload=True saat dev
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
