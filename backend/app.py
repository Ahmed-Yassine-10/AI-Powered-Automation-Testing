"""
Selenium Test Studio — Backend Flask
Gère: suites de tests, génération via Groq, exécution Selenium, historique
"""

import os
import json
import uuid
import subprocess
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, Response, stream_with_context, send_file
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

# ── Storage ──────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
SUITES_FILE = DATA_DIR / "suites.json"
RESULTS_FILE = DATA_DIR / "results.json"
PROJECTS_FILE = DATA_DIR / "projects.json"

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "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")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODELS = [
    os.environ.get("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct"),
    "deepseek/deepseek-chat-v3-0324",
    "openai/gpt-4o-mini",
]


@app.route("/api/record", methods=["POST"])
def record_actions():
    """
    Lance Playwright codegen sur l'URL donnée.
    Bloque jusqu'à la fermeture du navigateur, puis retourne le script généré.
    """
    data = request.json or {}
    url = data.get("url")
    if not url:
        return jsonify({"error": "URL requise"}), 400

    try:
        # Créer un fichier temp pour stocker le script python généré
        with tempfile.NamedTemporaryFile(suffix=".py", delete=False) as f:
            temp_path = f.name

        # Lancer playwright codegen
        import sys
        cmd = [sys.executable, "-m", "playwright", "codegen", url, "-o", temp_path, "--target", "python"]
        # run bloquera jusqu'à ce que l'utilisateur ferme la fenêtre du navigateur
        subprocess.run(cmd, check=True)

        # Lire le fichier généré
        with open(temp_path, "r", encoding="utf-8") as f:
            generated_code = f.read()

        # Nettoyage
        os.remove(temp_path)

        return jsonify({"code": generated_code})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def read_json(path: Path, default):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return default


def write_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Helpers ──────────────────────────────────────────────────────────────────
def get_projects():
    return read_json(PROJECTS_FILE, [])

def save_projects(projects):
    write_json(PROJECTS_FILE, projects)

def get_suites():
    return read_json(SUITES_FILE, [])


def save_suites(suites):
    write_json(SUITES_FILE, suites)


def get_results():
    return read_json(RESULTS_FILE, [])


def save_results(results):
    write_json(RESULTS_FILE, results)


def now_iso():
    return datetime.utcnow().isoformat() + "Z"


# ── Playwright parser ─────────────────────────────────────────────────────────
import re

def parse_playwright(code: str) -> list:
    actions = []
    for line in code.splitlines():
        line = line.strip()
        m = re.search(r"page\.goto\(['\"]([^'\"]+)['\"]\)", line)
        if m:
            actions.append({"action": "goto", "url": m.group(1)})
            continue
        m = re.search(r"get_by_role\(['\"]([^'\"]+)['\"],\s*name=['\"]([^'\"]+)['\"]\)\.fill\(['\"]([^'\"]*)['\"]", line)
        if m:
            actions.append({"action": "fill", "strategy": "role", "role": m.group(1), "name": m.group(2), "value": m.group(3)})
            continue
        m = re.search(r"get_by_role\(['\"]([^'\"]+)['\"],\s*name=['\"]([^'\"]+)['\"]\)\.click\(\)", line)
        if m:
            actions.append({"action": "click", "strategy": "role", "role": m.group(1), "name": m.group(2)})
            continue
        m = re.search(r"get_by_label\(['\"]([^'\"]+)['\"]\)\.fill\(['\"]([^'\"]*)['\"]", line)
        if m:
            actions.append({"action": "fill", "strategy": "label", "label": m.group(1), "value": m.group(2)})
            continue
        m = re.search(r"get_by_label\(['\"]([^'\"]+)['\"]\)\.click\(\)", line)
        if m:
            actions.append({"action": "click", "strategy": "label", "label": m.group(1)})
            continue
        m = re.search(r"get_by_placeholder\(['\"]([^'\"]+)['\"]\)\.fill\(['\"]([^'\"]*)['\"]", line)
        if m:
            actions.append({"action": "fill", "strategy": "placeholder", "placeholder": m.group(1), "value": m.group(2)})
            continue
        m = re.search(r"get_by_text\(['\"]([^'\"]+)['\"]\)\.click\(\)", line)
        if m:
            actions.append({"action": "click", "strategy": "text", "text": m.group(1)})
            continue
        m = re.search(r"locator\(['\"]([^'\"]+)['\"]\)\.click\(\)", line)
        if m:
            actions.append({"action": "click", "strategy": "css", "selector": m.group(1)})
            continue
        m = re.search(r"locator\(['\"]([^'\"]+)['\"]\)\.fill\(['\"]([^'\"]*)['\"]", line)
        if m:
            actions.append({"action": "fill", "strategy": "css", "selector": m.group(1), "value": m.group(2)})
            continue
        
        # Si aucune règle ne matche mais qu'il y a une action Playwright (page. ou await page.)
        if "page." in line:
            actions.append({"action": "raw", "code": line.strip()})
            continue

    return [a for a in actions if len(a) >= 1]


def sanitize_actions(actions: list) -> list:
    """Reduce noisy codegen events so the LLM sees only meaningful steps."""
    noisy_keys = {"End", "ArrowDown", "PageDown", "ArrowLeft", "ArrowRight", "NumLock", "Home"}
    sanitized = []

    def _target_key(a: dict):
        return (
            a.get("name") or "",
            a.get("label") or "",
            a.get("placeholder") or "",
            a.get("selector") or "",
            a.get("role") or "",
            a.get("text") or "",
        )

    for a in actions:
        action = a.get("action")

        # Drop raw keyboard-noise lines emitted by Playwright codegen.
        if action == "raw":
            code = (a.get("code") or "").strip()
            if ".press(" in code:
                if any(f".press('{k}')" in code or f'.press("{k}")' in code for k in noisy_keys):
                    continue
            sanitized.append(a)
            continue

        # Collapse exact duplicates that occur consecutively.
        if sanitized and sanitized[-1] == a:
            continue

        # If multiple fills target the same field consecutively, keep the latest.
        if action == "fill" and sanitized and sanitized[-1].get("action") == "fill":
            prev = sanitized[-1]
            same_target = (
                prev.get("name") == a.get("name") and
                prev.get("label") == a.get("label") and
                prev.get("placeholder") == a.get("placeholder") and
                prev.get("selector") == a.get("selector")
            )
            if same_target:
                sanitized[-1] = a
                continue

        sanitized.append(a)

    # Drop click noise when immediately followed by a fill on the same field.
    compact = []
    i = 0
    while i < len(sanitized):
        cur = sanitized[i]
        nxt = sanitized[i + 1] if i + 1 < len(sanitized) else None
        if (
            nxt and
            cur.get("action") == "click" and
            nxt.get("action") == "fill" and
            _target_key(cur) == _target_key(nxt)
        ):
            i += 1
            continue
        compact.append(cur)
        i += 1

    return compact


def build_prompt(name: str, url: str, task: str, actions: list, extra_selectors: str = "") -> str:
    class_name = re.sub(r'\W+', ' ', name).strip().title().replace(' ', '')
    steps_text = ""

    for i, a in enumerate(actions, 1):
        if "code" in a:
            steps_text += f"\nStep {i}: (Playwright raw code) `{a['code']}`"
        else:
            steps_text += f"\nStep {i}: {json.dumps(a)}"

    return f"""You are a senior QA automation engineer. Generate a complete, executable Python test script using the Playwright Sync API.

═══════════════════════════════════════════════════
MISSION
═══════════════════════════════════════════════════
Task   : {task}
URL    : {url}
Test   : test_{class_name.lower()}

═══════════════════════════════════════════════════
RECORDED STEPS 
═══════════════════════════════════════════════════
Translate these recorded steps into a robust Playwright script. 
If 'raw code' is provided, perfectly adapt it to the script.

{steps_text}

═══════════════════════════════════════════════════
MANDATORY OUTPUT RULES
═══════════════════════════════════════════════════
1. OUTPUT ONLY RAW PYTHON CODE. NO markdown block fences (like ```python). No explanations.
2. The code MUST run via `pytest` WITHOUT any external plugins like pytest-playwright.
3. Create a single test function matching the test name.
4. ASSERTIONS: You MUST add explicit `expect(page.locator(...))` assertions at the end of the test to verify if the goal described in "Task" actually succeeded or failed. 
   - VERY IMPORTANT: Increase the timeout for assertions to handle slow page loads or animations (e.g. `expect(locator).to_be_visible(timeout=15000)`).
   - If the task is a negative test (e.g. invalid login), assert that the error message appears, or that the application correctly blocks the action!
5. STRUCTURE:
import pytest
from playwright.sync_api import sync_playwright, expect

def test_{class_name.lower()}():
    with sync_playwright() as p:
        # Important: Headless MUST be False to show the browser visibly.
        browser = p.chromium.launch(headless=False, args=['--window-size=1920,1080'])
        context = browser.new_context(viewport={{'width': 1920, 'height': 1080}})
        page = context.new_page()
        
        try:
            # Your generated steps go here
            page.goto("{url}")
            
            # Use Auto-wait and robust Playwright locators
            # page.get_by_role(...).click()
            # page.locator(...).fill(...)
            
            # End with an explicit expectation asserting the DOM state
            # expect(page.locator(...)).to_be_visible()
            
        finally:
            context.close()
            browser.close()
"""


# ── API Routes ────────────────────────────────────────────────────────────────

@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "time": now_iso()})

# Projects CRUD
@app.route("/api/projects", methods=["GET"])
def list_projects():
    return jsonify(get_projects())

@app.route("/api/projects", methods=["POST"])
def create_project():
    data = request.json
    project = {
        "id": str(uuid.uuid4()),
        "name": data.get("name", "Nouveau Projet"),
        "description": data.get("description", ""),
        "createdAt": now_iso(),
    }
    projects = get_projects()
    projects.insert(0, project)
    save_projects(projects)
    return jsonify(project), 201

@app.route("/api/projects/<pid>", methods=["GET"])
def get_project(pid):
    projects = get_projects()
    p = next((p for p in projects if p["id"] == pid), None)
    if not p: return jsonify({"error": "Not found"}), 404
    return jsonify(p)

@app.route("/api/projects/<pid>", methods=["DELETE"])
def delete_project(pid):
    projects = get_projects()
    projects = [p for p in projects if p["id"] != pid]
    save_projects(projects)
    # Also delete associated suites
    suites = get_suites()
    suites = [s for s in suites if s.get("projectId") != pid]
    save_suites(suites)
    return jsonify({"ok": True})

@app.route("/api/projects/<pid>/report", methods=["GET"])
def get_project_report(pid):
    projects = get_projects()
    p = next((p for p in projects if p["id"] == pid), None)
    if not p: return jsonify({"error": "Projet introuvable"}), 404
    
    suites = [s for s in get_suites() if s.get("projectId") == pid]
    results = get_results()
    
    report = f"# Rapport d'Exécution : {p['name']}\n\n"
    report += f"**Description:** {p.get('description', '')}\n"
    report += f"**Date de génération:** {now_iso()}\n\n"
    report += f"## Cas de test ({len(suites)})\n"
    
    for s in suites:
        s_results = [r for r in results if r.get("suiteId") == s["id"]]
        success_count = sum(1 for r in s_results if r.get("status") == "success")
        fail_count = sum(1 for r in s_results if r.get("status") == "failed")
        
        report += f"### {s['name']}\n"
        report += f"- URL: {s['url']}\n"
        report += f"- Objectif: {s['task']}\n"
        report += f"- Exécutions : {len(s_results)} ({success_count} ✅, {fail_count} ❌)\n"
        
        if s_results:
            last = s_results[0]
            report += f"- Dernier statut : **{last.get('status', 'inconnu').upper()}** le {last.get('startedAt', last.get('createdAt'))}\n"
            if last.get("error"):
                report += f"  - Erreur : `{last.get('error')[:200]}`\n"
        report += "\n"
        
    return jsonify({"report": report})

@app.route("/api/projects/<pid>/report/pdf", methods=["GET"])
def get_project_report_pdf(pid):
    projects = get_projects()
    p = next((p for p in projects if p["id"] == pid), None)
    if not p: return jsonify({"error": "Projet introuvable"}), 404
    
    suites = [s for s in get_suites() if s.get("projectId") == pid]
    results = get_results()
    
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.colors import red, green, black
        
        fd, temp_path = tempfile.mkstemp(suffix=".pdf")
        os.close(fd)
        
        doc = SimpleDocTemplate(temp_path, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
        styles = getSampleStyleSheet()
        story = []

        title_style = styles["Title"]
        h2_style = styles["Heading2"]
        h3_style = styles["Heading3"]
        normal_style = styles["Normal"]
        
        success_style = ParagraphStyle('Success', parent=normal_style, textColor=green)
        fail_style = ParagraphStyle('Fail', parent=normal_style, textColor=red)

        story.append(Paragraph(f"Rapport d'Exécution : {p['name']}", title_style))
        story.append(Spacer(1, 12))
        story.append(Paragraph(f"<b>Date de génération :</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", normal_style))
        story.append(Paragraph(f"<b>Description :</b> {p.get('description', 'Aucune description')}", normal_style))
        story.append(Spacer(1, 20))
        
        story.append(Paragraph(f"Résumé des Cas de Test ({len(suites)})", h2_style))
        story.append(Spacer(1, 10))

        for s in suites:
            s_results = [r for r in results if r.get("suiteId") == s["id"]]
            success_count = sum(1 for r in s_results if r.get("status") == "pass")
            fail_count = sum(1 for r in s_results if r.get("status") == "fail")

            block = []
            block.append(Paragraph(f"Test: {s['name']}", h3_style))
            block.append(Paragraph(f"<b>URL target:</b> {s['url']}", normal_style))
            block.append(Paragraph(f"<b>Scénario et Assertions:</b> {s['task']}", normal_style))
            block.append(Paragraph(f"<b>Total Exécutions:</b> {len(s_results)} ({success_count} Succès, {fail_count} Échecs)", normal_style))
            
            if s_results:
                last = s_results[0]
                status = last.get('status', 'inconnu').upper()
                st_style = success_style if status == 'PASS' else fail_style if status == 'FAIL' else normal_style
                block.append(Paragraph(f"<b>Dernier Résultat:</b> {status} (le {last.get('startedAt', last.get('createdAt'))})", st_style))
                
                if status == 'FAIL' and last.get('error'):
                    err_text = last.get('error')[:300].replace('\n', '<br/>')
                    block.append(Paragraph(f"<b>Détail de l'erreur (pour les développeurs):</b> <font color='red'>{err_text}</font>", normal_style))
            
            block.append(Spacer(1, 15))
            story.append(KeepTogether(block))

        doc.build(story)
        return send_file(temp_path, as_attachment=True, download_name=f"Rapport_{p['name'].replace(' ', '_')}.pdf", mimetype="application/pdf")
    except ImportError:
        return jsonify({"error": "La librairie ReportLab n'est pas installée."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Suites CRUD
@app.route("/api/suites", methods=["GET"])
def list_suites():
    pid = request.args.get("projectId")
    suites = get_suites()
    if pid:
        suites = [s for s in suites if s.get("projectId") == pid]
    return jsonify(suites)

@app.route("/api/suites", methods=["POST"])
def create_suite():
    data = request.json
    suite = {
        "id": str(uuid.uuid4()),
        "projectId": data.get("projectId"),
        "name": data["name"],
        "url": data["url"],
        "task": data["task"],
        "playwrightCode": data.get("playwrightCode", ""),
        "actions": data.get("actions", []),
        "script": data.get("script", ""),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    suites = get_suites()
    suites.insert(0, suite)
    save_suites(suites)
    return jsonify(suite), 201


@app.route("/api/suites/<sid>", methods=["GET"])
def get_suite(sid):
    suites = get_suites()
    suite = next((s for s in suites if s["id"] == sid), None)
    if not suite:
        return jsonify({"error": "Not found"}), 404
    return jsonify(suite)


@app.route("/api/suites/<sid>", methods=["PUT"])
def update_suite(sid):
    suites = get_suites()
    idx = next((i for i, s in enumerate(suites) if s["id"] == sid), None)
    if idx is None:
        return jsonify({"error": "Not found"}), 404
    data = request.json
    suites[idx].update(data)
    suites[idx]["updatedAt"] = now_iso()
    save_suites(suites)
    return jsonify(suites[idx])


@app.route("/api/suites/<sid>", methods=["DELETE"])
def delete_suite(sid):
    suites = get_suites()
    suites = [s for s in suites if s["id"] != sid]
    save_suites(suites)
    results = get_results()
    results = [r for r in results if r.get("suiteId") != sid]
    save_results(results)
    return jsonify({"ok": True})


# Parse Playwright
@app.route("/api/parse", methods=["POST"])
def parse_route():
    code = request.json.get("code", "")
    actions = parse_playwright(code)
    return jsonify({"actions": actions})


# Generate script via OpenRouter (streaming)
@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.json
    name    = data.get("name", "Test")
    url     = data.get("url", "")
    task    = data.get("task", "")
    actions = data.get("actions", [])
    extra   = data.get("extraSelectors", "")

    actions = sanitize_actions(actions)

    prompt = build_prompt(name, url, task, actions, extra)

    def stream():
        try:
            if not OPENROUTER_API_KEY:
                yield 'data: {"error": "OPENROUTER_API_KEY manquante dans l\'environnement backend."}\n\n'
                yield "data: [DONE]\n\n"
                return

            last_status = None
            last_error = ""
            for model in OPENROUTER_MODELS:
                or_resp = requests.post(
                    OPENROUTER_URL,
                    headers={
                        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost:3000",
                        "X-Title": "selenium-test-studio",
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.0,
                        "max_tokens": 2048,
                        "stream": True,
                    },
                    stream=True,
                    timeout=60,
                )

                if or_resp.status_code >= 400:
                    last_status = or_resp.status_code
                    last_error = or_resp.text[:800].replace("\n", " ")
                    continue

                for line in or_resp.iter_lines():
                    if not line:
                        continue
                    line = line.decode("utf-8")
                    if line.startswith("data: "):
                        payload = line[6:].strip()
                        if payload == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        yield f"{line}\n\n"

                yield "data: [DONE]\n\n"
                return

            safe_err = json.dumps({"error": f"OpenRouter API HTTP {last_status or 503}: {last_error or 'Tous les modèles OpenRouter de secours sont indisponibles. Réessayez dans quelques secondes.'}"}, ensure_ascii=False)
            yield f"data: {safe_err}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"

    return Response(stream_with_context(stream()), content_type="text/event-stream")


# Run suite (execute Selenium script)
@app.route("/api/suites/<sid>/run", methods=["POST"])
def run_suite(sid):
    suites = get_suites()
    suite = next((s for s in suites if s["id"] == sid), None)
    if not suite:
        return jsonify({"error": "Suite not found"}), 404

    script = suite.get("script", "")
    if not script:
        return jsonify({"error": "No script to run"}), 400

    result = {
        "id": str(uuid.uuid4()),
        "suiteId": sid,
        "suiteName": suite["name"],
        "status": "running",
        "output": "",
        "error": "",
        "startedAt": now_iso(),
        "finishedAt": None,
        "duration": None,
    }

    results = get_results()
    results.insert(0, result)
    save_results(results)

    def execute():
        start = time.time()
        
        # Clean up Markdown code blocks if Groq added them
        clean_script = script.strip()
        if clean_script.startswith("```python"):
            clean_script = clean_script[9:]
        elif clean_script.startswith("```"):
            clean_script = clean_script[3:]
        if clean_script.endswith("```"):
            clean_script = clean_script[:-3]
        clean_script = clean_script.strip()
        
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w",
                                        encoding="utf-8", delete=False) as f:
            f.write(clean_script)
            tmppath = f.name
        try:
            import sys
            proc = subprocess.run(
                [sys.executable, "-m", "pytest", tmppath, "-v", "--tb=short", "--no-header"],
                capture_output=True, text=True, timeout=120
            )
            result["status"]  = "pass" if proc.returncode == 0 else "fail"
            result["output"]  = proc.stdout[-4000:] if proc.stdout else ""
            result["error"]   = proc.stderr[-2000:] if proc.stderr else ""
        except subprocess.TimeoutExpired:
            result["status"] = "fail"
            result["error"]  = "Timeout (120s) dépassé"
        except FileNotFoundError:
            result["status"] = "fail"
            result["error"]  = "Python/pytest introuvable. Vérifiez votre environnement."
        except Exception as e:
            result["status"] = "fail"
            result["error"]  = str(e)
        finally:
            result["finishedAt"] = now_iso()
            result["duration"]   = round(time.time() - start, 2)
            try:
                os.unlink(tmppath)
            except Exception:
                pass
            # Update results
            all_results = get_results()
            for i, r in enumerate(all_results):
                if r["id"] == result["id"]:
                    all_results[i] = result
                    break
            save_results(all_results)

    threading.Thread(target=execute, daemon=True).start()
    return jsonify(result), 202


@app.route("/api/suites/<sid>/run/status/<rid>", methods=["GET"])
def run_status(sid, rid):
    results = get_results()
    r = next((x for x in results if x["id"] == rid), None)
    if not r:
        return jsonify({"error": "Not found"}), 404
    return jsonify(r)


# Results
@app.route("/api/results", methods=["GET"])
def list_results():
    suite_id = request.args.get("suiteId")
    results = get_results()
    if suite_id:
        results = [r for r in results if r.get("suiteId") == suite_id]
    return jsonify(results)


@app.route("/api/results/<rid>", methods=["PATCH"])
def patch_result(rid):
    results = get_results()
    for i, r in enumerate(results):
        if r["id"] == rid:
            results[i].update(request.json)
            save_results(results)
            return jsonify(results[i])
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    print("🚀 Selenium Test Studio backend démarré sur http://localhost:5000")
    app.run(debug=True, port=5000)
