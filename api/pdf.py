from fastapi import FastAPI, File, UploadFile, HTTPException, Form, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import subprocess
import os
import uuid
from datetime import datetime
from typing import Optional
import shutil
import asyncio
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="BabelDOC PDF Translation API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = "output"
UPLOAD_DIR = "uploads"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

MODEL_PRESETS = {
    "OpenAI": {
        "base_url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        "api_key": os.getenv("OPENAI_API_KEY"),
        "default_model": os.getenv("OPENAI_DEFAULT_MODEL", "gpt-4o-mini"),
    },
}


class TranslationResponse(BaseModel):
    task_id: str
    status: str
    message: str
    download_url: Optional[str] = None


class TaskStatus(BaseModel):
    task_id: str
    status: str
    message: str
    file_name: str
    download_url: Optional[str] = None


tasks_status = {}


def run_babeldoc_translation(
    input_path: str,
    output_path: str,
    model_name: str,
    base_url: str,
    api_key: str,
    lang_out: str,
    no_dual: bool,
):
    command = [
        "babeldoc",
        "--files",
        input_path,
        "--openai",
        "--openai-model",
        model_name,
        "--openai-base-url",
        base_url,
        "--openai-api-key",
        api_key,
        "--lang-out",
        lang_out,
        "--output",
        output_path,
        "--skip-clean",
        "--watermark-output-mode",
        "no_watermark",
        "--min-text-length",
        "1",
        "--max-pages-per-part",
        "30",
    ]

    if no_dual:
        command.append("--no-dual")

    print("📦 command:", " ".join(command))

    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        print("📋 subprocess output:")
        print(f"Return code: {result.returncode}")
        print(f"STDOUT:\n{result.stdout}")
        print(f"STDERR:\n{result.stderr}")
        return True, "translation completed"
    except subprocess.CalledProcessError as e:
        return False, f"translation error: {str(e)}"


def process_translation_task(
    task_id: str,
    input_path: str,
    output_path: str,
    model_name: str,
    base_url: str,
    api_key: str,
    lang_out: str,
    no_dual: bool,
):
    try:
        tasks_status[task_id]["status"] = "processing"
        tasks_status[task_id]["message"] = "translating..."

        success, message = run_babeldoc_translation(
            input_path, output_path, model_name, base_url, api_key, lang_out, no_dual
        )

        if success:
            pdf_files = sorted(
                [f for f in os.listdir(output_path) if f.endswith(".pdf")],
                key=lambda x: os.path.getmtime(os.path.join(output_path, x)),
                reverse=True,
            )

            if pdf_files:
                tasks_status[task_id]["status"] = "completed"
                tasks_status[task_id]["message"] = "translation completed"
                tasks_status[task_id]["download_url"] = f"/download/{task_id}"
                tasks_status[task_id]["output_file"] = os.path.join(output_path, pdf_files[0])
            else:
                tasks_status[task_id]["status"] = "failed"
                tasks_status[task_id]["message"] = "translation file not found"
        elif task_id in tasks_status:
            tasks_status[task_id]["status"] = "failed"
            tasks_status[task_id]["message"] = message
        else:
            print(f"task_id deleted in tasks_status: {task_id}")
    except Exception as e:
        if task_id in tasks_status:
            tasks_status[task_id]["status"] = "failed"
            tasks_status[task_id]["message"] = f"translation error: {str(e)}"
    finally:
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
                print(f"Input file deleted: {input_path}")
        except Exception as e:
            print(f"Error deleting input file: {e}")


async def auto_delete_task(task_id: str, delay_hours: int = 4):
    await asyncio.sleep(delay_hours * 3600)

    if task_id not in tasks_status:
        print(f"Task {task_id} already deleted")
        return

    task = tasks_status[task_id]
    print(f"Auto deleting task {task_id} after {delay_hours} hours")

    try:
        if "input_file" in task and os.path.exists(task["input_file"]):
            os.remove(task["input_file"])
            print(f"Deleted input file: {task['input_file']}")

        if "output_dir" in task and os.path.exists(task["output_dir"]):
            shutil.rmtree(task["output_dir"])
            print(f"Deleted output directory: {task['output_dir']}")

        del tasks_status[task_id]
        print(f"Task {task_id} successfully auto-deleted")

    except Exception as e:
        print(f"Error auto-deleting task {task_id}: {e}")


@app.get("/")
async def root():
    return {"message": "BabelDOC PDF Translation API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.post("/translate", response_model=TranslationResponse)
async def translate_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    lang_out: str = Form("ko"),
    no_dual: bool = Form(False),
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="only pdf files are supported")

    provider = "OpenAI"
    api_key = MODEL_PRESETS[provider]["api_key"]
    base_url = MODEL_PRESETS[provider]["base_url"]
    model_name = MODEL_PRESETS[provider]["default_model"]

    task_id = str(uuid.uuid4())
    file_id = str(uuid.uuid4())
    filename = file.filename
    name_root = os.path.splitext(filename)[0]
    input_path = os.path.join(UPLOAD_DIR, f"{file_id}_{filename}")

    try:
        with open(input_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 오류: {str(e)}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_subdir = os.path.join(OUTPUT_DIR, f"{name_root}_{timestamp}")
    os.makedirs(output_subdir, exist_ok=True)

    tasks_status[task_id] = {
        "status": "pending",
        "message": "translation pending",
        "file_name": filename,
        "created_at": datetime.now().isoformat(),
        "input_file": input_path,
        "output_dir": output_subdir,
    }

    background_tasks.add_task(
        process_translation_task,
        task_id,
        input_path,
        output_subdir,
        model_name,
        base_url,
        api_key,
        lang_out,
        no_dual,
    )

    background_tasks.add_task(auto_delete_task, task_id, 4)

    return TranslationResponse(
        task_id=task_id,
        status="pending",
        message="translation started",
        download_url=None,
    )


@app.get("/status/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    if task_id not in tasks_status:
        raise HTTPException(status_code=404, detail="task not found")

    task = tasks_status[task_id]
    return TaskStatus(
        task_id=task_id,
        status=task["status"],
        message=task["message"],
        file_name=task["file_name"],
        download_url=task.get("download_url"),
    )


@app.get("/download/{task_id}")
async def download_translated_file(task_id: str):
    if task_id not in tasks_status:
        raise HTTPException(status_code=404, detail="task not found")

    task = tasks_status[task_id]

    if task["status"] != "completed":
        raise HTTPException(status_code=400, detail="translation not completed")

    if "output_file" not in task or not os.path.exists(task["output_file"]):
        raise HTTPException(status_code=404, detail="translation file not found")

    return FileResponse(
        path=task["output_file"],
        filename=os.path.basename(task["output_file"]),
        media_type="application/pdf",
    )


@app.get("/tasks")
async def list_tasks():
    return {"tasks": tasks_status}


@app.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    if task_id not in tasks_status:
        raise HTTPException(status_code=200, detail="task already deleted")

    task = tasks_status[task_id]

    try:
        if "input_file" in task and os.path.exists(task["input_file"]):
            os.remove(task["input_file"])
        if "output_dir" in task and os.path.exists(task["output_dir"]):
            shutil.rmtree(task["output_dir"])
    except Exception as e:
        print(f"file delete error: {e}")

    del tasks_status[task_id]

    return {"message": "task deleted"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
