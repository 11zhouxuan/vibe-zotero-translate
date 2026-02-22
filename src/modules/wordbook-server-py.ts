// Auto-generated from wordbook/wordbook_server.py
// Do not edit directly - edit wordbook_server.py and rebuild
export const WORDBOOK_SERVER_PY = `#!/usr/bin/env python3
"""
Vibe Wordbook Server - A FastAPI server to visualize and manage your Zotero wordbook.

Usage:
    pip install fastapi uvicorn
    python wordbook_server.py [--path ~/Documents/zotero-wordbook] [--port 8765]

Then open http://localhost:8765 in your browser.
"""

import argparse
import csv
import io
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

try:
    from fastapi import FastAPI, HTTPException, Query
    from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    print("Error: Required packages not installed.")
    print("Please run: pip install fastapi uvicorn pydantic")
    sys.exit(1)

# ============ Configuration ============

DEFAULT_WORDBOOK_PATH = os.path.expanduser("~/Documents/zotero-wordbook")
DEFAULT_PORT = 8765

# ============ Models ============

class WordEntry(BaseModel):
    id: str
    word: str
    translation: str
    isSingleWord: bool = False
    starred: bool = False
    queryCount: int = 1
    pageNumber: Optional[int] = None
    sourceTitle: Optional[str] = None
    createdAt: str = ""
    updatedAt: str = ""

class StarRequest(BaseModel):
    id: str

class DeleteRequest(BaseModel):
    id: str

# ============ App ============

app = FastAPI(title="Vibe Wordbook Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

WORDBOOK_DIR = DEFAULT_WORDBOOK_PATH

def set_wordbook_dir(path: str):
    global WORDBOOK_DIR
    WORDBOOK_DIR = path
    os.makedirs(WORDBOOK_DIR, exist_ok=True)

def read_all_words() -> List[dict]:
    words = []
    if not os.path.isdir(WORDBOOK_DIR):
        return words
    for fname in os.listdir(WORDBOOK_DIR):
        if fname.endswith(".json"):
            fpath = os.path.join(WORDBOOK_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "id" in data and "word" in data:
                        words.append(data)
            except (json.JSONDecodeError, IOError):
                pass
    return words

def read_word(word_id: str) -> Optional[dict]:
    fpath = os.path.join(WORDBOOK_DIR, f"{word_id}.json")
    if not os.path.isfile(fpath):
        return None
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None

def write_word(entry: dict):
    fpath = os.path.join(WORDBOOK_DIR, f"{entry['id']}.json")
    with open(fpath, "w", encoding="utf-8") as f:
        json.dump(entry, f, ensure_ascii=False, indent=2)
    # Append to meta.jsonl
    jsonl_path = os.path.join(WORDBOOK_DIR, "meta.jsonl")
    with open(jsonl_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\\n")

def delete_word(word_id: str) -> bool:
    fpath = os.path.join(WORDBOOK_DIR, f"{word_id}.json")
    if os.path.isfile(fpath):
        os.remove(fpath)
        return True
    return False

# ============ API Routes ============

@app.get("/api/words")
def get_words(
    q: Optional[str] = Query(None),
    sort: str = Query("time"),
    starred: Optional[str] = Query(None),
):
    words = read_all_words()

    if q and q.strip():
        search = q.strip().lower()
        words = [w for w in words if search in w.get("word", "").lower() or search in w.get("translation", "").lower()]

    if starred in ("true", "1"):
        words = [w for w in words if w.get("starred")]

    if sort in ("word", "alpha"):
        words.sort(key=lambda w: w.get("word", "").lower())
    elif sort == "count":
        words.sort(key=lambda w: w.get("queryCount", 0), reverse=True)
    else:
        words.sort(key=lambda w: w.get("updatedAt", ""), reverse=True)

    return {"words": words, "total": len(words)}

@app.post("/api/words/star")
def toggle_star(req: StarRequest):
    entry = read_word(req.id)
    if not entry:
        raise HTTPException(status_code=404, detail="Word not found")
    entry["starred"] = not entry.get("starred", False)
    entry["updatedAt"] = datetime.utcnow().isoformat() + "Z"
    write_word(entry)
    return {"success": True, "word": entry}

class UpdateTranslationRequest(BaseModel):
    id: str
    translation: str

@app.post("/api/words/update")
def update_translation(req: UpdateTranslationRequest):
    entry = read_word(req.id)
    if not entry:
        raise HTTPException(status_code=404, detail="Word not found")
    entry["translation"] = req.translation
    entry["updatedAt"] = datetime.utcnow().isoformat() + "Z"
    write_word(entry)
    return {"success": True, "word": entry}

@app.post("/api/words/delete")
def delete_word_api(req: DeleteRequest):
    if not delete_word(req.id):
        raise HTTPException(status_code=404, detail="Word not found")
    return {"success": True}

@app.get("/api/stats")
def get_stats():
    words = read_all_words()
    return {
        "total": len(words),
        "starred": sum(1 for w in words if w.get("starred")),
        "singleWords": sum(1 for w in words if w.get("isSingleWord")),
        "phrases": sum(1 for w in words if not w.get("isSingleWord")),
        "totalQueries": sum(w.get("queryCount", 0) for w in words),
    }

@app.get("/api/export/csv")
def export_csv(starred: Optional[str] = Query(None)):
    words = read_all_words()
    if starred in ("true", "1"):
        words = [w for w in words if w.get("starred")]
    words.sort(key=lambda w: w.get("updatedAt", ""), reverse=True)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Word", "Translation", "Type", "Starred", "Count", "Page", "Source", "Created", "Updated"])
    for w in words:
        writer.writerow([
            w.get("id", ""),
            w.get("word", ""),
            w.get("translation", ""),
            "word" if w.get("isSingleWord") else "phrase",
            "yes" if w.get("starred") else "no",
            w.get("queryCount", 0),
            w.get("pageNumber", "") or "",
            w.get("sourceTitle", "") or "",
            w.get("createdAt", ""),
            w.get("updatedAt", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=wordbook.csv"},
    )

@app.get("/api/export/anki")
def export_anki(starred: Optional[str] = Query(None)):
    words = read_all_words()
    if starred in ("true", "1"):
        words = [w for w in words if w.get("starred")]
    words.sort(key=lambda w: w.get("word", "").lower())

    lines = []
    for w in words:
        front = w.get("word", "").replace("\\t", " ").replace("\\n", " ")
        back = w.get("translation", "").replace("\\t", " ").replace("\\n", "<br>")
        lines.append(f"{front}\\t{back}")

    content = "\\n".join(lines)
    return StreamingResponse(
        io.StringIO(content),
        media_type="text/tab-separated-values",
        headers={"Content-Disposition": "attachment; filename=wordbook-anki.txt"},
    )

@app.get("/api/export/json")
def export_json(starred: Optional[str] = Query(None)):
    words = read_all_words()
    if starred in ("true", "1"):
        words = [w for w in words if w.get("starred")]
    words.sort(key=lambda w: w.get("updatedAt", ""), reverse=True)

    # Normalize all entries to have consistent fields
    normalized = []
    for w in words:
        normalized.append({
            "id": w.get("id", ""),
            "word": w.get("word", ""),
            "translation": w.get("translation", ""),
            "isSingleWord": w.get("isSingleWord", False),
            "starred": w.get("starred", False),
            "queryCount": w.get("queryCount", 1),
            "pageNumber": w.get("pageNumber"),
            "sourceTitle": w.get("sourceTitle", ""),
            "createdAt": w.get("createdAt", ""),
            "updatedAt": w.get("updatedAt", ""),
        })

    content = json.dumps(normalized, ensure_ascii=False, indent=2)
    return StreamingResponse(
        io.StringIO(content),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=wordbook.json"},
    )

# ============ HTML Page ============

@app.get("/", response_class=HTMLResponse)
def index():
    return get_html()

def get_html() -> str:
    return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vibe Wordbook</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<style>
body{background:#f0f2f5}
.star-btn{cursor:pointer;font-size:20px;user-select:none;background:none;border:none;padding:2px 6px;transition:transform .15s}
.star-btn:hover{transform:scale(1.3)}
.translation-cell{font-family:"SF Mono",Monaco,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;max-width:400px;line-height:1.7}
.toast-container{position:fixed;bottom:20px;right:20px;z-index:1050}
.stat-card{text-align:center;padding:16px}
.stat-card .num{font-size:28px;font-weight:700;color:#667eea}
.stat-card .lbl{font-size:12px;color:#888;margin-top:2px}
.copy-btn{opacity:0;transition:opacity .2s;font-size:11px}
td:hover .copy-btn{opacity:1}
.export-group .btn{font-size:13px}
.id-cell{font-family:monospace;font-size:10px;color:#aaa;word-break:break-all;min-width:80px;cursor:pointer}
.id-cell:hover{color:#667eea}
th{position:relative}
.edit-area{width:100%;min-height:60px;font-family:"SF Mono",Monaco,Menlo,Consolas,monospace;font-size:13px;line-height:1.7;border:2px solid #667eea;border-radius:4px;padding:4px 6px;resize:vertical}
.edit-actions{margin-top:4px;display:flex;gap:4px}
.translation-cell{cursor:pointer}
.translation-cell:hover{background:#f0f0ff}
</style>
</head>
<body>
<nav class="navbar navbar-dark" style="background:linear-gradient(135deg,#667eea,#764ba2)">
<div class="container">
<span class="navbar-brand mb-0 h1">&#x1F4D6; Vibe Wordbook</span>
<div class="d-flex gap-3 text-white align-items-center">
<span>&#x1F4DA; Total: <strong id="st">0</strong></span>
<span>&#x2B50; Starred: <strong id="ss">0</strong></span>
</div>
</div>
</nav>
<div class="container mt-3">

<div class="row g-2 mb-3">
<div class="col"><div class="card stat-card"><div class="num" id="sn-total">0</div><div class="lbl">Total Words</div></div></div>
<div class="col"><div class="card stat-card"><div class="num" id="sn-words">0</div><div class="lbl">Single Words</div></div></div>
<div class="col"><div class="card stat-card"><div class="num" id="sn-phrases">0</div><div class="lbl">Phrases</div></div></div>
<div class="col"><div class="card stat-card"><div class="num" id="sn-starred">0</div><div class="lbl">Starred</div></div></div>
<div class="col"><div class="card stat-card"><div class="num" id="sn-queries">0</div><div class="lbl">Total Queries</div></div></div>
</div>

<div class="row g-2 mb-3">
<div class="col-md-5"><input type="text" class="form-control" id="qi" placeholder="&#x1F50D; Search words or translations..."></div>
<div class="col-md-2">
<select class="form-select" id="so">
<option value="time">&#x1F554; Latest</option>
<option value="alpha">&#x1F524; A-Z</option>
<option value="count">&#x1F522; Most Queried</option>
<option value="starred">&#x2B50; Starred First</option>
</select>
</div>
<div class="col-md-2"><button class="btn btn-outline-primary w-100" id="sf">&#x2B50; Starred Only</button></div>
<div class="col-md-3 export-group d-flex gap-1">
<a class="btn btn-outline-secondary flex-fill" href="/api/export/csv" title="Download CSV">&#x1F4CB; CSV</a>
<a class="btn btn-outline-secondary flex-fill" href="/api/export/anki" title="Download Anki TSV">&#x1F4DD; Anki</a>
<a class="btn btn-outline-secondary flex-fill" href="/api/export/json" title="Download JSON">&#x1F4E6; JSON</a>
</div>
</div>
<div id="wl"><div class="text-center py-5 text-muted">Loading...</div></div>
</div>
<div class="toast-container"><div class="toast align-items-center text-bg-dark" id="toast" role="alert"><div class="d-flex"><div class="toast-body" id="toast-body"></div></div></div></div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
const API=window.location.origin;
let starOnly=false,curSort="time",sq="",timer=null;

async function apiGet(p){const r=await fetch(API+p);return r.json()}
async function apiPost(p,d){const r=await fetch(API+p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});return r.json()}

async function loadStats(){
  try{
    const s=await apiGet("/api/stats");
    document.getElementById("st").textContent=s.total;
    document.getElementById("ss").textContent=s.starred;
    document.getElementById("sn-total").textContent=s.total;
    document.getElementById("sn-words").textContent=s.singleWords;
    document.getElementById("sn-phrases").textContent=s.phrases;
    document.getElementById("sn-starred").textContent=s.starred;
    document.getElementById("sn-queries").textContent=s.totalQueries;
  }catch(e){}
}

async function load(){
  try{
    const params=new URLSearchParams();
    if(sq)params.set("q",sq);
    params.set("sort",curSort);
    if(starOnly)params.set("starred","true");
    const data=await apiGet("/api/words?"+params);
    render(data.words);
  }catch(e){console.error(e)}
  loadStats();
}

function render(words){
  const el=document.getElementById("wl");
  if(!words.length){
    el.innerHTML='<div class="text-center py-5"><div style="font-size:48px">&#x1F4ED;</div><h5 class="mt-3">'+(sq?"No matching words":"Your wordbook is empty")+'</h5><p class="text-muted">'+(sq?"Try a different search":"Start translating in Zotero!")+'</p></div>';
    return;
  }
  let h='<div class="table-responsive"><table class="table table-hover align-middle"><thead class="table-light"><tr>';
  h+='<th style="width:100px">ID</th><th style="width:50px">&#x2B50;</th><th>Word</th><th>Translation (click to edit)</th><th style="width:80px">Count</th><th style="width:120px">Time</th><th style="width:60px"></th></tr></thead><tbody>';
  words.forEach(function(w){
    h+='<tr>';
    h+='<td class="id-cell" data-fullid="'+w.id+'" title="Click to copy: '+w.id+'">'+w.id.substring(0,8)+'...</td>';
    h+='<td><button class="star-btn" data-id="'+w.id+'" onclick="toggleStar(this.dataset.id)">'+(w.starred?'&#x2B50;':'&#x2606;')+'</button></td>';
    h+='<td><strong>'+esc(w.word)+'</strong> <span class="badge '+(w.isSingleWord?'bg-primary':'bg-info')+' ms-1">'+(w.isSingleWord?'Word':'Phrase')+'</span></td>';
    h+='<td class="translation-cell" data-id="'+w.id+'" onclick="editTranslation(this)">'+esc(w.translation)+'</td>';
    h+='<td class="text-center"><span class="badge bg-secondary">'+w.queryCount+'x</span></td>';
    h+='<td><small class="text-muted">'+fmtDate(w.updatedAt)+'</small></td>';
    h+='<td><button class="btn btn-sm btn-outline-danger" data-id="'+w.id+'" data-word="'+esc(w.word).replace(/"/g,'&quot;')+'" onclick="deleteWord(this.dataset.id,this.dataset.word)">&#x1F5D1;&#xFE0F;</button></td>';
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  el.innerHTML=h;
}

function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
function fmtDate(iso){
  const d=new Date(iso),n=new Date(),ms=n-d,m=Math.floor(ms/6e4),h=Math.floor(ms/36e5),dy=Math.floor(ms/864e5);
  if(m<1)return"just now";if(m<60)return m+"m ago";if(h<24)return h+"h ago";if(dy<7)return dy+"d ago";
  return d.toLocaleDateString("zh-CN",{year:"numeric",month:"short",day:"numeric"});
}

async function toggleStar(id){
  try{await apiPost("/api/words/star",{id});showToast("Star toggled!");load()}
  catch(e){showToast("Failed")}
}
async function deleteWord(id,word){
  if(!confirm('Delete "'+word+'"?'))return;
  try{await apiPost("/api/words/delete",{id});showToast("Deleted");load()}
  catch(e){showToast("Failed")}
}
function editTranslation(td){
  if(td.querySelector("textarea"))return;
  var id=td.getAttribute("data-id");
  var original=td.textContent;
  td.onclick=null;
  td.setAttribute("data-editing","1");
  var ta=document.createElement("textarea");
  ta.className="edit-area";
  ta.value=original;
  var actions=document.createElement("div");
  actions.className="edit-actions";
  var saveBtn=document.createElement("button");
  saveBtn.className="btn btn-sm btn-primary";
  saveBtn.textContent="Save";
  saveBtn.onclick=function(){saveTranslation(td,id)};
  var cancelBtn=document.createElement("button");
  cancelBtn.className="btn btn-sm btn-secondary";
  cancelBtn.textContent="Cancel";
  cancelBtn.onclick=function(){load()};
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  td.textContent="";
  td.appendChild(ta);
  td.appendChild(actions);
  ta.focus();
  ta.setSelectionRange(ta.value.length,ta.value.length);
}
async function saveTranslation(td,id){
  var ta=td.querySelector("textarea");
  if(!ta)return;
  var newText=ta.value.trim();
  if(!newText){showToast("Translation cannot be empty");return}
  try{
    await apiPost("/api/words/update",{id:id,translation:newText});
    showToast("Translation updated!");
    load();
  }catch(e){showToast("Failed to save")}
}
function copyId(td,fullId){
  if(navigator.clipboard){navigator.clipboard.writeText(fullId).then(function(){showToast("ID copied: "+fullId)}).catch(function(){})}
  else{var ta=document.createElement("textarea");ta.value=fullId;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);showToast("ID copied: "+fullId)}
}
function copyText(btn){
  var text=btn.getAttribute("data-text");
  if(navigator.clipboard){navigator.clipboard.writeText(text).then(function(){showToast("Copied!")}).catch(function(){})}
  else{var ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);showToast("Copied!")}
}
function showToast(msg){
  document.getElementById("toast-body").textContent=msg;
  var t=new bootstrap.Toast(document.getElementById("toast"),{delay:2000});t.show();
}

document.getElementById("qi").addEventListener("input",function(){clearTimeout(timer);timer=setTimeout(()=>{sq=this.value.trim();load()},300)});
document.getElementById("so").addEventListener("change",function(){curSort=this.value;load()});
document.getElementById("sf").addEventListener("click",function(){starOnly=!starOnly;this.classList.toggle("btn-primary",starOnly);this.classList.toggle("btn-outline-primary",!starOnly);load()});
document.getElementById("wl").addEventListener("click",function(e){var td=e.target.closest(".id-cell");if(td&&td.dataset.fullid){copyId(td,td.dataset.fullid)}});

load();
setInterval(load,10000);
</script>
</body>
</html>"""

# ============ Main ============

def main():
    parser = argparse.ArgumentParser(description="Vibe Wordbook Server")
    parser.add_argument("--path", default=DEFAULT_WORDBOOK_PATH, help=f"Wordbook directory path (default: {DEFAULT_WORDBOOK_PATH})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Server port (default: {DEFAULT_PORT})")
    parser.add_argument("--host", default="127.0.0.1", help="Server host (default: 127.0.0.1)")
    args = parser.parse_args()

    set_wordbook_dir(args.path)
    print(f"\\U0001F4D6 Vibe Wordbook Server")
    print(f"   Wordbook path: {WORDBOOK_DIR}")
    print(f"   Server: http://{args.host}:{args.port}")
    print(f"   Press Ctrl+C to stop")
    print()

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")

if __name__ == "__main__":
    main()`;
