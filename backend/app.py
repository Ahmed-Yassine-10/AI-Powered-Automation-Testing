"""
Selenium Test Studio — Backend Flask
Gère: projets, suites de tests, génération via OpenRouter (LLM), exécution
Playwright/pytest, artefacts d'échec, auto-réparation IA, historique.
"""

import os
import sys
import json
import uuid
import shutil
import subprocess
import tempfile
import threading
import time
import re
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, request, jsonify, Response, stream_with_context, send_file, abort
from flask_cors import CORS
import requests

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    # python-dotenv est recommandé mais pas obligatoire : les variables
    # d'environnement système restent utilisables sans lui.
    pass

app = Flask(__name__)
CORS(app)

# ── Storage ──────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
ARTIFACTS_DIR = Path(__file__).parent / "artifacts"
ARTIFACTS_DIR.mkdir(exist_ok=True)

SUITES_FILE = DATA_DIR / "suites.json"
RESULTS_FILE = DATA_DIR / "results.json"
PROJECTS_FILE = DATA_DIR / "projects.json"

# ── Statuts (source de vérité unique) ────────────────────────────────────────
STATUS_PASS = "pass"
STATUS_FAIL = "fail"
STATUS_RUNNING = "running"
STATUS_PENDING = "pending"

# ── Config OpenRouter ─────────────────────────────────────────────────────────
# AUCUNE clé par défaut : elle doit venir de l'environnement / du fichier .env.
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODELS = [
    os.environ.get("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct"),
    "deepseek/deepseek-chat-v3-0324",
    "openai/gpt-4o-mini",
]

RUN_TIMEOUT = int(os.environ.get("RUN_TIMEOUT", "120"))

# Verrou global protégeant les lectures-modifications-écritures des fichiers JSON.
_STORE_LOCK = threading.RLock()


# ── Persistance JSON (thread-safe) ─────────────────────────────────────────────
def read_json(path: Path, default):
    with _STORE_LOCK:
        try:
            if path.exists():
                return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
        return default


def write_json(path: Path, data):
    with _STORE_LOCK:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


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
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── Nettoyage / validation du code généré ──────────────────────────────────────
def clean_llm_script(script: str) -> str:
    """Retire les fences Markdown (```python … ```) que le LLM peut ajouter."""
    clean = (script or "").strip()
    if clean.startswith("```python"):
        clean = clean[9:]
    elif clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    return clean.strip()


def validate_python(script: str):
    """Retourne None si le script compile, sinon un message d'erreur lisible."""
    try:
        compile(clean_llm_script(script), "<generated-test>", "exec")
        return None
    except SyntaxError as e:
        return f"Ligne {e.lineno}: {e.msg}"
    except Exception as e:  # pragma: no cover
        return str(e)


# ── Appels OpenRouter ──────────────────────────────────────────────────────────
def _or_headers():
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "selenium-test-studio",
    }


def call_openrouter(prompt: str, temperature: float = 0.0, max_tokens: int = 2048):
    """Appel non-streaming avec bascule sur les modèles de secours.
    Retourne (texte, None) en cas de succès, (None, message_erreur) sinon."""
    last_err = ""
    for model in OPENROUTER_MODELS:
        try:
            resp = requests.post(
                OPENROUTER_URL,
                headers=_or_headers(),
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": False,
                },
                timeout=60,
            )
            if resp.status_code >= 400:
                last_err = f"HTTP {resp.status_code}: {resp.text[:300]}"
                continue
            data = resp.json()
            return data["choices"][0]["message"]["content"], None
        except Exception as e:
            last_err = str(e)
            continue
    return None, last_err or "Tous les modèles OpenRouter sont indisponibles."


# ── Enregistrement Playwright codegen (non-bloquant, modèle « job ») ────────────
_record_jobs = {}
_record_lock = threading.Lock()


@app.route("/api/record", methods=["POST"])
def record_actions():
    """Lance Playwright codegen en arrière-plan et retourne un id de job.
    Le frontend interroge ensuite GET /api/record/<id> jusqu'à `status=done`."""
    data = request.json or {}
    url = data.get("url")
    if not url:
        return jsonify({"error": "URL requise"}), 400

    job_id = str(uuid.uuid4())
    with _record_lock:
        _record_jobs[job_id] = {"id": job_id, "status": "recording", "code": None, "error": None}

    def worker():
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".py", delete=False) as f:
                temp_path = f.name
            cmd = [sys.executable, "-m", "playwright", "codegen", url, "-o", temp_path, "--target", "python"]
            subprocess.run(cmd, check=True)  # bloque jusqu'à fermeture du navigateur
            with open(temp_path, "r", encoding="utf-8") as f:
                code = f.read()
            with _record_lock:
                _record_jobs[job_id].update(status="done", code=code)
        except Exception as e:
            with _record_lock:
                _record_jobs[job_id].update(status="error", error=str(e))
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    threading.Thread(target=worker, daemon=True).start()
    return jsonify({"id": job_id, "status": "recording"}), 202


@app.route("/api/record/<job_id>", methods=["GET"])
def record_status(job_id):
    with _record_lock:
        job = _record_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Not found"}), 404
    return jsonify(job)


# ── Nettoyage des actions bruitées du codegen ──────────────────────────────────
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

        if action == "raw":
            code = (a.get("code") or "").strip()
            if ".press(" in code:
                if any(f".press('{k}')" in code or f'.press("{k}")' in code for k in noisy_keys):
                    continue
            sanitized.append(a)
            continue

        if sanitized and sanitized[-1] == a:
            continue

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


def build_prompt(name: str, url: str, task: str, actions: list, extra_selectors: str = "", headless: bool = False) -> str:
    class_name = re.sub(r'\W+', ' ', name).strip().title().replace(' ', '')
    steps_text = ""

    for i, a in enumerate(actions, 1):
        if "code" in a:
            steps_text += f"\nStep {i}: (Playwright raw code) `{a['code']}`"
        else:
            steps_text += f"\nStep {i}: {json.dumps(a)}"

    extra_block = f"\nEXTRA SELECTORS:\n{extra_selectors}" if extra_selectors else ""

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

{steps_text}{extra_block}

═══════════════════════════════════════════════════
MANDATORY OUTPUT RULES
═══════════════════════════════════════════════════
1. OUTPUT ONLY RAW PYTHON CODE. NO markdown block fences (like ```python). No explanations.
2. The code MUST run via `pytest` WITHOUT any external plugins like pytest-playwright.
3. Create a single test function matching the test name.
4. ASSERTIONS: You MUST add explicit `expect(page.locator(...))` assertions at the end of the test to verify if the goal described in "Task" actually succeeded or failed.
   - VERY IMPORTANT: Increase the timeout for assertions to handle slow page loads or animations (e.g. `expect(locator).to_be_visible(timeout=15000)`).
   - If the task is a negative test (e.g. invalid login), assert that the error message appears, or that the application correctly blocks the action!
5. ARTIFACTS: capture a screenshot on failure and a Playwright trace, into the folder given by the ARTIFACTS_DIR env var (default "."). Follow the STRUCTURE below EXACTLY.
6. STRUCTURE (respect it precisely, including tracing and the failure screenshot):
import os
import pytest
from playwright.sync_api import sync_playwright, expect

def test_{class_name.lower()}():
    artifacts = os.environ.get("ARTIFACTS_DIR", ".")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless={headless}, args=['--window-size=1920,1080'])
        context = browser.new_context(viewport={{'width': 1920, 'height': 1080}})
        context.tracing.start(screenshots=True, snapshots=True)
        page = context.new_page()
        try:
            page.goto("{url}")
            # Use auto-wait and robust Playwright locators here
            # page.get_by_role(...).click()
            # page.locator(...).fill(...)
            # End with explicit expect(...) assertions verifying the DOM state
        except Exception:
            page.screenshot(path=os.path.join(artifacts, "failure.png"), full_page=True)
            raise
        finally:
            context.tracing.stop(path=os.path.join(artifacts, "trace.zip"))
            context.close()
            browser.close()
"""


def build_heal_prompt(script: str, failure_output: str, task: str) -> str:
    return f"""You are a senior QA automation engineer. This Playwright test FAILED.

── CURRENT SCRIPT ──
{clean_llm_script(script)}

── PYTEST OUTPUT (failure) ──
{failure_output or "(no output captured)"}

── TASK THE TEST MUST VERIFY ──
{task}

Fix the script so it passes while STILL genuinely verifying the task.
- Prefer more robust locators (get_by_role, get_by_label, get_by_placeholder) over brittle CSS/XPath.
- Increase timeouts on assertions if the failure looks timing-related.
- Keep the same test function name and the same ARTIFACTS_DIR screenshot/trace structure.
OUTPUT ONLY THE FULL CORRECTED PYTHON SCRIPT. No markdown fences, no explanations."""


# ── Statistiques par suite (flakiness, taux de réussite) ───────────────────────
def suite_stats(sid: str, results=None) -> dict:
    if results is None:
        results = get_results()
    rs = [r for r in results if r.get("suiteId") == sid]
    recent = rs[:10]
    finished = [r for r in recent if r.get("status") in (STATUS_PASS, STATUS_FAIL)]
    passes = sum(1 for r in finished if r.get("status") == STATUS_PASS)
    pass_rate = round(100 * passes / len(finished)) if finished else None
    durations = [r.get("duration") for r in rs if isinstance(r.get("duration"), (int, float))]
    avg = round(sum(durations) / len(durations), 1) if durations else None
    return {
        "passRate": pass_rate,
        "avgDuration": avg,
        "lastStatus": rs[0].get("status") if rs else STATUS_PENDING,
        "runCount": len(rs),
        "flaky": any(r.get("flaky") for r in recent),
    }


# ── Artefacts ──────────────────────────────────────────────────────────────────
def _collect_artifacts(artifact_dir: Path) -> list:
    arts = []
    try:
        for f in sorted(artifact_dir.iterdir()):
            if f.is_file():
                arts.append(f.name)
    except Exception:
        pass
    return arts


def _delete_artifacts(result_ids):
    for rid in result_ids:
        d = ARTIFACTS_DIR / str(rid)
        if d.exists():
            try:
                shutil.rmtree(d)
            except Exception:
                pass


# ── Exécution d'un script (une tentative) ──────────────────────────────────────
def _run_script_once(script: str, artifact_dir: Path, headless: bool):
    clean_script = clean_llm_script(script)
    if headless:
        clean_script = re.sub(r"headless\s*=\s*False", "headless=True", clean_script)

    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", encoding="utf-8", delete=False) as f:
        f.write(clean_script)
        tmppath = f.name

    env = {**os.environ, "ARTIFACTS_DIR": str(artifact_dir)}
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", tmppath, "-v", "--tb=short", "--no-header"],
            capture_output=True, text=True, timeout=RUN_TIMEOUT, env=env,
        )
        status = STATUS_PASS if proc.returncode == 0 else STATUS_FAIL
        output = proc.stdout[-4000:] if proc.stdout else ""
        error = proc.stderr[-2000:] if proc.stderr else ""
    except subprocess.TimeoutExpired:
        status, output, error = STATUS_FAIL, "", f"Timeout ({RUN_TIMEOUT}s) dépassé"
    except FileNotFoundError:
        status, output, error = STATUS_FAIL, "", "Python/pytest introuvable. Vérifiez votre environnement."
    except Exception as e:
        status, output, error = STATUS_FAIL, "", str(e)
    finally:
        try:
            os.unlink(tmppath)
        except Exception:
            pass

    return status, output, error


def _new_result(suite: dict) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "suiteId": suite["id"],
        "suiteName": suite["name"],
        "status": STATUS_RUNNING,
        "output": "",
        "error": "",
        "attempts": 0,
        "flaky": False,
        "artifacts": [],
        "startedAt": now_iso(),
        "finishedAt": None,
        "duration": None,
    }


def _execute_result(result: dict, script: str, headless: bool, retries: int):
    """Exécute le script (avec retries) et persiste le résultat final."""
    start = time.time()
    artifact_dir = ARTIFACTS_DIR / result["id"]
    artifact_dir.mkdir(parents=True, exist_ok=True)

    statuses = []
    final = (STATUS_FAIL, "", "Aucune exécution")
    for _ in range(max(1, retries + 1)):
        status, output, error = _run_script_once(script, artifact_dir, headless)
        statuses.append(status)
        final = (status, output, error)
        if status == STATUS_PASS:
            break

    status, output, error = final
    result["status"] = status
    result["output"] = output
    result["error"] = error
    result["attempts"] = len(statuses)
    result["flaky"] = (STATUS_FAIL in statuses and status == STATUS_PASS)
    result["artifacts"] = _collect_artifacts(artifact_dir)
    result["finishedAt"] = now_iso()
    result["duration"] = round(time.time() - start, 2)

    with _STORE_LOCK:
        all_results = get_results()
        for i, r in enumerate(all_results):
            if r["id"] == result["id"]:
                all_results[i] = result
                break
        save_results(all_results)


# ── API Routes ────────────────────────────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "time": now_iso(),
        "openrouter": bool(OPENROUTER_API_KEY),
    })


# ── Projects CRUD ──────────────────────────────────────────────────────────────
@app.route("/api/projects", methods=["GET"])
def list_projects():
    return jsonify(get_projects())


@app.route("/api/projects", methods=["POST"])
def create_project():
    data = request.json or {}
    project = {
        "id": str(uuid.uuid4()),
        "name": data.get("name", "Nouveau Projet"),
        "description": data.get("description", ""),
        "createdAt": now_iso(),
    }
    with _STORE_LOCK:
        projects = get_projects()
        projects.insert(0, project)
        save_projects(projects)
    return jsonify(project), 201


@app.route("/api/projects/<pid>", methods=["GET"])
def get_project(pid):
    p = next((p for p in get_projects() if p["id"] == pid), None)
    if not p:
        return jsonify({"error": "Not found"}), 404
    return jsonify(p)


@app.route("/api/projects/<pid>", methods=["DELETE"])
def delete_project(pid):
    with _STORE_LOCK:
        projects = [p for p in get_projects() if p["id"] != pid]
        save_projects(projects)
        suites = get_suites()
        suite_ids = {s["id"] for s in suites if s.get("projectId") == pid}
        save_suites([s for s in suites if s.get("projectId") != pid])
        results = get_results()
        orphan_result_ids = [r["id"] for r in results if r.get("suiteId") in suite_ids]
        save_results([r for r in results if r.get("suiteId") not in suite_ids])
    _delete_artifacts(orphan_result_ids)
    return jsonify({"ok": True})


@app.route("/api/projects/<pid>/report", methods=["GET"])
def get_project_report(pid):
    p = next((p for p in get_projects() if p["id"] == pid), None)
    if not p:
        return jsonify({"error": "Projet introuvable"}), 404

    suites = [s for s in get_suites() if s.get("projectId") == pid]
    results = get_results()

    report = f"# Rapport d'Exécution : {p['name']}\n\n"
    report += f"**Description:** {p.get('description', '')}\n"
    report += f"**Date de génération:** {now_iso()}\n\n"
    report += f"## Cas de test ({len(suites)})\n"

    for s in suites:
        s_results = [r for r in results if r.get("suiteId") == s["id"]]
        success_count = sum(1 for r in s_results if r.get("status") == STATUS_PASS)
        fail_count = sum(1 for r in s_results if r.get("status") == STATUS_FAIL)

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
    p = next((p for p in get_projects() if p["id"] == pid), None)
    if not p:
        return jsonify({"error": "Projet introuvable"}), 404

    suites = [s for s in get_suites() if s.get("projectId") == pid]
    results = get_results()

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.colors import red, green

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
            success_count = sum(1 for r in s_results if r.get("status") == STATUS_PASS)
            fail_count = sum(1 for r in s_results if r.get("status") == STATUS_FAIL)

            block = []
            block.append(Paragraph(f"Test: {s['name']}", h3_style))
            block.append(Paragraph(f"<b>URL target:</b> {s['url']}", normal_style))
            block.append(Paragraph(f"<b>Scénario et Assertions:</b> {s['task']}", normal_style))
            block.append(Paragraph(f"<b>Total Exécutions:</b> {len(s_results)} ({success_count} Succès, {fail_count} Échecs)", normal_style))

            if s_results:
                last = s_results[0]
                status = last.get('status', 'inconnu').upper()
                st_style = success_style if status == STATUS_PASS.upper() else fail_style if status == STATUS_FAIL.upper() else normal_style
                block.append(Paragraph(f"<b>Dernier Résultat:</b> {status} (le {last.get('startedAt', last.get('createdAt'))})", st_style))

                if status == STATUS_FAIL.upper() and last.get('error'):
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


@app.route("/api/projects/<pid>/run-all", methods=["POST"])
def run_all(pid):
    body = request.json or {}
    headless = bool(body.get("headless", True))  # batch → headless par défaut
    retries = int(body.get("retries", 0))

    suites = [s for s in get_suites() if s.get("projectId") == pid and s.get("script")]
    if not suites:
        return jsonify({"error": "Aucune suite exécutable dans ce projet."}), 400

    created = [_new_result(s) for s in suites]
    with _STORE_LOCK:
        all_results = get_results()
        for result in created:
            all_results.insert(0, result)
        save_results(all_results)

    pairs = list(zip(created, suites))

    def batch():
        for result, suite in pairs:
            _execute_result(result, suite["script"], headless=headless, retries=retries)

    threading.Thread(target=batch, daemon=True).start()
    return jsonify({"resultIds": [r["id"] for r in created]}), 202


# ── Suites CRUD ────────────────────────────────────────────────────────────────
ALLOWED_SUITE_FIELDS = {"name", "url", "task", "script", "actions", "playwrightCode", "projectId"}


@app.route("/api/suites", methods=["GET"])
def list_suites():
    pid = request.args.get("projectId")
    suites = get_suites()
    if pid:
        suites = [s for s in suites if s.get("projectId") == pid]
    results = get_results()
    for s in suites:
        s["stats"] = suite_stats(s["id"], results)
    return jsonify(suites)


@app.route("/api/suites", methods=["POST"])
def create_suite():
    data = request.json or {}
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
    with _STORE_LOCK:
        suites = get_suites()
        suites.insert(0, suite)
        save_suites(suites)
    return jsonify(suite), 201


@app.route("/api/suites/<sid>", methods=["GET"])
def get_suite(sid):
    suite = next((s for s in get_suites() if s["id"] == sid), None)
    if not suite:
        return jsonify({"error": "Not found"}), 404
    return jsonify(suite)


@app.route("/api/suites/<sid>", methods=["PUT"])
def update_suite(sid):
    with _STORE_LOCK:
        suites = get_suites()
        idx = next((i for i, s in enumerate(suites) if s["id"] == sid), None)
        if idx is None:
            return jsonify({"error": "Not found"}), 404
        data = {k: v for k, v in (request.json or {}).items() if k in ALLOWED_SUITE_FIELDS}
        suites[idx].update(data)
        suites[idx]["updatedAt"] = now_iso()
        save_suites(suites)
        updated = suites[idx]
    return jsonify(updated)


@app.route("/api/suites/<sid>", methods=["DELETE"])
def delete_suite(sid):
    with _STORE_LOCK:
        suites = [s for s in get_suites() if s["id"] != sid]
        save_suites(suites)
        results = get_results()
        orphan_result_ids = [r["id"] for r in results if r.get("suiteId") == sid]
        save_results([r for r in results if r.get("suiteId") != sid])
    _delete_artifacts(orphan_result_ids)
    return jsonify({"ok": True})


# ── Validation d'un script ─────────────────────────────────────────────────────
@app.route("/api/validate", methods=["POST"])
def validate_route():
    script = (request.json or {}).get("script", "")
    err = validate_python(script)
    return jsonify({"valid": err is None, "error": err})


# ── Generate script via OpenRouter (streaming SSE) ─────────────────────────────
@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.json or {}
    name = data.get("name", "Test")
    url = data.get("url", "")
    task = data.get("task", "")
    actions = data.get("actions", [])
    extra = data.get("extraSelectors", "")

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
                    headers=_or_headers(),
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
            safe = json.dumps({"error": str(e)}, ensure_ascii=False)
            yield f"data: {safe}\n\n"
            yield "data: [DONE]\n\n"

    return Response(stream_with_context(stream()), content_type="text/event-stream")


# ── Auto-réparation IA d'un test échoué ────────────────────────────────────────
@app.route("/api/suites/<sid>/heal", methods=["POST"])
def heal_suite(sid):
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "OPENROUTER_API_KEY manquante dans l'environnement backend."}), 400

    body = request.json or {}
    rid = body.get("resultId")

    suite = next((s for s in get_suites() if s["id"] == sid), None)
    if not suite:
        return jsonify({"error": "Suite introuvable"}), 404

    script = suite.get("script", "")
    if not script:
        return jsonify({"error": "Aucun script à réparer"}), 400

    failure_output = ""
    if rid:
        r = next((x for x in get_results() if x["id"] == rid), None)
        if r:
            failure_output = ((r.get("output") or "") + "\n" + (r.get("error") or "")).strip()[-2000:]

    prompt = build_heal_prompt(script, failure_output, suite.get("task", ""))
    text, err = call_openrouter(prompt)
    if err:
        return jsonify({"error": f"Réparation impossible : {err}"}), 502

    return jsonify({"proposedScript": clean_llm_script(text)})


# ── Run suite (exécution du script) ────────────────────────────────────────────
@app.route("/api/suites/<sid>/run", methods=["POST"])
def run_suite(sid):
    body = request.json or {}
    headless = bool(body.get("headless", False))
    retries = int(body.get("retries", 0))

    suite = next((s for s in get_suites() if s["id"] == sid), None)
    if not suite:
        return jsonify({"error": "Suite not found"}), 404

    script = suite.get("script", "")
    if not script:
        return jsonify({"error": "No script to run"}), 400

    result = _new_result(suite)
    with _STORE_LOCK:
        results = get_results()
        results.insert(0, result)
        save_results(results)

    threading.Thread(
        target=_execute_result,
        args=(result, script, headless, retries),
        daemon=True,
    ).start()
    return jsonify(result), 202


@app.route("/api/suites/<sid>/run/status/<rid>", methods=["GET"])
def run_status(sid, rid):
    r = next((x for x in get_results() if x["id"] == rid), None)
    if not r:
        return jsonify({"error": "Not found"}), 404
    return jsonify(r)


@app.route("/api/suites/<sid>/stats", methods=["GET"])
def get_suite_stats(sid):
    return jsonify(suite_stats(sid))


# ── Results ─────────────────────────────────────────────────────────────────────
@app.route("/api/results", methods=["GET"])
def list_results():
    suite_id = request.args.get("suiteId")
    results = get_results()
    if suite_id:
        results = [r for r in results if r.get("suiteId") == suite_id]
    return jsonify(results)


@app.route("/api/results/<rid>", methods=["PATCH"])
def patch_result(rid):
    with _STORE_LOCK:
        results = get_results()
        for i, r in enumerate(results):
            if r["id"] == rid:
                results[i].update(request.json or {})
                save_results(results)
                return jsonify(results[i])
    return jsonify({"error": "Not found"}), 404


@app.route("/api/results/<rid>/artifacts/<name>", methods=["GET"])
def get_artifact(rid, name):
    from werkzeug.utils import secure_filename
    safe = secure_filename(name)
    base = (ARTIFACTS_DIR / rid).resolve()
    target = (base / safe).resolve()
    if target.parent != base or not target.exists():
        abort(404)
    return send_file(str(target))


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "true").lower() in ("1", "true", "yes")
    port = int(os.environ.get("FLASK_PORT", "5000"))
    print(f"🚀 Selenium Test Studio backend démarré sur http://localhost:{port}")
    if not OPENROUTER_API_KEY:
        print("⚠  OPENROUTER_API_KEY absente : la génération et l'auto-réparation seront désactivées.")
    app.run(debug=debug, port=port)
