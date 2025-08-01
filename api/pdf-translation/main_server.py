from fastapi import FastAPI, File, UploadFile, HTTPException, Form, status
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
import asyncio
import httpx
import logging
from urllib.parse import quote
from gcs_utils import (
    get_gcs_manager,
    generate_gcs_key,
    cleanup_temp_file,
    cleanup_task_related_temp_files,
)
from contextlib import asynccontextmanager
from collections import deque
import threading
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 환경 변수 설정
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", "40")) * 1024 * 1024  # 50MB
AUTO_DELETE_HOURS = int(os.getenv("AUTO_DELETE_HOURS", "24"))
WORKER_SERVER_URL = os.getenv("WORKER_SERVER_URL", "http://localhost:8001")
MAX_CONCURRENT_TASKS = int(os.getenv("MAX_CONCURRENT_TASKS", "1"))
QUEUE_CHECK_INTERVAL = int(os.getenv("QUEUE_CHECK_INTERVAL", "5"))  # 5초마다 큐 체크


# 큐 관리 클래스
class TranslationQueueManager:
    def __init__(self):
        self.queue = deque()
        self.processing_tasks = set()
        self.lock = threading.Lock()
        self.is_running = False
        self.queue_processor_task = None

    def add_task(self, task_data: dict):
        """큐에 작업 추가"""
        with self.lock:
            self.queue.append(task_data)
            logger.info(
                f"Task {task_data['task_id']} added to queue. Queue size: {len(self.queue)}"
            )

    def get_next_task(self) -> Optional[dict]:
        """큐에서 다음 작업 가져오기"""
        with self.lock:
            if self.queue and len(self.processing_tasks) < MAX_CONCURRENT_TASKS:
                task_data = self.queue.popleft()
                self.processing_tasks.add(task_data["task_id"])
                logger.info(
                    f"Task {task_data['task_id']} started processing. Processing: {len(self.processing_tasks)}"
                )
                return task_data
        return None

    def complete_task(self, task_id: str):
        """작업 완료 처리"""
        with self.lock:
            self.processing_tasks.discard(task_id)
            logger.info(
                f"Task {task_id} completed. Processing: {len(self.processing_tasks)}"
            )

    def get_queue_status(self) -> dict:
        """큐 상태 반환"""
        with self.lock:
            return {
                "queue_size": len(self.queue),
                "processing_count": len(self.processing_tasks),
                "processing_tasks": list(self.processing_tasks),
                "max_concurrent": MAX_CONCURRENT_TASKS,
            }

    def start_queue_processor(self):
        """큐 처리기 시작"""
        self.is_running = True
        self.queue_processor_task = asyncio.create_task(self._queue_processor())
        logger.info("Queue processor started")

    def stop_queue_processor(self):
        """큐 처리기 중단"""
        self.is_running = False
        if self.queue_processor_task:
            self.queue_processor_task.cancel()
        logger.info("Queue processor stopped")

    async def _queue_processor(self):
        """백그라운드 큐 처리기"""
        while self.is_running:
            try:
                task_data = self.get_next_task()
                if task_data:
                    # 비동기로 워커 서버에 작업 전송
                    asyncio.create_task(
                        self._process_task_with_worker(task_data, retry_count=0)
                    )
            except Exception as e:
                logger.error(f"Error in queue processor: {e}")
            finally:
                await asyncio.sleep(QUEUE_CHECK_INTERVAL)

    async def _process_task_with_worker(self, task_data: dict, retry_count: int = 0):
        """워커 서버에 작업 전송"""
        task_id = task_data["task_id"]
        max_retries = 3

        # 최대 재시도 횟수 초과시 완전 실패 처리
        if retry_count >= max_retries:
            logger.error(f"Task {task_id} failed after {max_retries} retries")
            if task_id in tasks_status:
                tasks_status[task_id]["status"] = "failed"
                tasks_status[task_id][
                    "message"
                ] = f"Worker server connection failed after {max_retries} retries"
            self.complete_task(task_id)
            return

        try:
            # 워커 서버에 번역 작업 요청
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{WORKER_SERVER_URL}/process", json=task_data
                )

                if response.status_code == 200:
                    logger.info(f"Task {task_id} sent to worker server successfully")
                    # 성공시에만 작업 완료 처리 (워커가 상태 업데이트 담당)
                    self.complete_task(task_id)
                    return
                else:
                    logger.error(
                        f"Worker server error for task {task_id}: {response.status_code} - {response.text}"
                    )
                    # 5xx 서버 오류나 429 Too Many Requests는 재시도
                    if response.status_code >= 500 or response.status_code == 429:
                        raise Exception(f"Retryable error: {response.status_code}")
                    else:
                        # 4xx 클라이언트 오류는 재시도하지 않음
                        if task_id in tasks_status:
                            tasks_status[task_id]["status"] = "failed"
                            tasks_status[task_id][
                                "message"
                            ] = f"Worker server error: {response.status_code}"
                        self.complete_task(task_id)
                        return

        except httpx.TimeoutException:
            logger.error(
                f"Worker server timeout for task {task_id} (attempt {retry_count + 1}/{max_retries})"
            )
            # 타임아웃은 재시도 가능한 오류
            pass

        except Exception as e:
            logger.error(
                f"Error sending task {task_id} to worker server (attempt {retry_count + 1}/{max_retries}): {e}"
            )
            # 연결 오류 등은 재시도 가능한 오류
            pass

        # 재시도 로직: 백오프 전략 적용
        backoff_delay = min(2**retry_count, 60)  # 최대 60초까지
        logger.info(
            f"Retrying task {task_id} in {backoff_delay} seconds (attempt {retry_count + 1}/{max_retries})"
        )
        await asyncio.sleep(backoff_delay)

        # 재시도
        await self._process_task_with_worker(task_data, retry_count + 1)


# 글로벌 큐 매니저
queue_manager = TranslationQueueManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 생명주기 관리"""
    logger.info("Starting BabelDOC PDF Translation API - Main Server")

    # 큐 처리기 시작
    queue_manager.start_queue_processor()

    yield

    # 정리 작업
    logger.info("Shutting down BabelDOC PDF Translation API - Main Server")
    queue_manager.stop_queue_processor()


app = FastAPI(
    title="BabelDOC PDF Translation API - Main Server",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 설정 개선
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

# 로컬 디렉토리 생성 (GCS 사용 시에도 호환성을 위해 유지)
OUTPUT_DIR = "output"
UPLOAD_DIR = "uploads"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)


class TranslationResponse(BaseModel):
    task_id: str
    status: str
    message: str
    download_url: Optional[str] = None
    queue_position: Optional[int] = None


class TaskStatus(BaseModel):
    task_id: str
    status: str
    message: str
    file_name: str
    download_url: Optional[str] = None
    created_at: str
    progress: Optional[float] = None
    queue_position: Optional[int] = None


class QueueStatus(BaseModel):
    queue_size: int
    processing_count: int
    processing_tasks: List[str]
    max_concurrent: int


# 싱글턴 객체로 task_status 관리
tasks_status: Dict[str, Dict[str, Any]] = {}


async def auto_delete_task(task_id: str, delay_hours: int = AUTO_DELETE_HOURS):
    """작업 자동 삭제"""
    try:
        await asyncio.sleep(delay_hours * 3600)

        if task_id not in tasks_status:
            logger.info(f"Task {task_id} already deleted")
            return

        task = tasks_status[task_id]
        logger.info(f"Auto deleting task {task_id} after {delay_hours} hours")

        gcs_manager = get_gcs_manager()

        # GCS에서 입력 파일 삭제
        if "input_gcs_key" in task:
            success = gcs_manager.delete_file(task["input_gcs_key"])
            if success:
                logger.info(f"Deleted input file from GCS: {task['input_gcs_key']}")
            else:
                logger.warning(
                    f"Failed to delete input file from GCS: {task['input_gcs_key']}"
                )

        # GCS에서 출력 파일들 삭제 (디렉터리 전체)
        if "output_gcs_prefix" in task:
            success = gcs_manager.delete_files_with_prefix(task["output_gcs_prefix"])
            if success:
                logger.info(
                    f"Deleted output files from GCS with prefix: {task['output_gcs_prefix']}"
                )
            else:
                logger.warning(
                    f"Failed to delete output files from GCS with prefix: {task['output_gcs_prefix']}"
                )
        elif "output_gcs_key" in task:
            success = gcs_manager.delete_file(task["output_gcs_key"])
            if success:
                logger.info(f"Deleted output file from GCS: {task['output_gcs_key']}")
            else:
                logger.warning(
                    f"Failed to delete output file from GCS: {task['output_gcs_key']}"
                )

        # 작업 관련 임시 파일들 정리
        cleanup_task_related_temp_files(task_id)

        del tasks_status[task_id]
        logger.info(f"Auto deleted task {task_id}")

    except Exception as e:
        logger.error(f"Error auto-deleting task {task_id}: {e}")


def get_task_queue_position(task_id: str) -> Optional[int]:
    """큐에서 작업의 위치 반환"""
    with queue_manager.lock:
        for i, task_data in enumerate(queue_manager.queue):
            if task_data["task_id"] == task_id:
                return i + 1
        return None


async def validate_pdf_file(file: UploadFile) -> bool:
    """PDF 파일 유효성 검증"""
    if not file.filename:
        return False

    if not file.filename.lower().endswith(".pdf"):
        return False

    # 파일 크기 체크
    file_size = 0
    chunk_size = 8192
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        file_size += len(chunk)
        if file_size > MAX_FILE_SIZE:
            return False

    # 파일 포인터 리셋
    await file.seek(0)

    # PDF 헤더 체크
    first_chunk = await file.read(1024)
    await file.seek(0)

    return first_chunk.startswith(b"%PDF-")


@app.get("/")
async def root():
    return {
        "message": "BabelDOC PDF Translation API - Main Server",
        "version": "1.0.0",
        "status": "healthy",
    }


@app.get("/health")
async def health_check():
    queue_status = queue_manager.get_queue_status()
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_tasks": len(tasks_status),
        "queue_status": queue_status,
    }


@app.get("/queue", response_model=QueueStatus)
async def get_queue_status():
    """큐 상태 조회"""
    return queue_manager.get_queue_status()


@app.post("/translate", response_model=TranslationResponse)
async def translate_pdf(
    file: UploadFile = File(...),
    lang_out: str = Form("ko"),
    no_dual: bool = Form(False),
):
    """PDF 번역 요청"""

    # 파일 유효성 검증
    if not await validate_pdf_file(file):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid PDF file or file too large",
        )

    task_id = str(uuid.uuid4())
    filename = file.filename

    try:
        # GCS에 파일 업로드
        gcs_manager = get_gcs_manager()
        input_gcs_key = generate_gcs_key("uploads", filename)

        # 스트리밍 방식으로 파일 업로드 (메모리 효율성)
        success = gcs_manager.upload_fileobj(file.file, input_gcs_key)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="File upload failed",
            )

        logger.info(f"File uploaded to GCS: {input_gcs_key}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File upload error: {str(e)}",
        )

    # 출력 GCS 키 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_gcs_prefix = f"outputs/{task_id}_{timestamp}"

    # 작업 상태 저장
    tasks_status[task_id] = {
        "status": "queued",
        "message": "Task queued for processing",
        "file_name": filename,
        "created_at": datetime.now().isoformat(),
        "input_gcs_key": input_gcs_key,
        "output_gcs_prefix": output_gcs_prefix,
        "progress": 0.0,
        "lang_out": lang_out,
        "no_dual": no_dual,
    }

    logger.info(f"Task {task_id} created")

    # 큐에 작업 추가
    task_data = {
        "task_id": task_id,
        "input_gcs_key": input_gcs_key,
        "output_gcs_prefix": output_gcs_prefix,
        "lang_out": lang_out,
        "no_dual": no_dual,
        "file_name": filename,
    }

    queue_manager.add_task(task_data)

    # 큐 위치 확인
    queue_position = get_task_queue_position(task_id)

    # 자동 삭제 태스크 생성
    asyncio.create_task(auto_delete_task(task_id, AUTO_DELETE_HOURS))

    return TranslationResponse(
        task_id=task_id,
        status="queued",
        message="Translation queued for processing",
        download_url=None,
        queue_position=queue_position,
    )


@app.post("/update_task_status")
async def update_task_status(
    task_id: str = Form(...),
    status_str: str = Form(...),
    message: str = Form(...),
    output_gcs_key: Optional[str] = Form(None),
    progress: Optional[float] = Form(None),
):
    """워커 서버에서 호출하는 상태 업데이트 엔드포인트"""
    if task_id not in tasks_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )

    task = tasks_status[task_id]
    task["status"] = status_str
    task["message"] = message

    if progress is not None:
        task["progress"] = progress

    if output_gcs_key:
        task["output_gcs_key"] = output_gcs_key
        if status_str == "completed":
            task["download_url"] = f"/download/{task_id}"

    logger.info(f"Task {task_id} status updated to {status_str}")
    return {"message": "Status updated"}


@app.get("/status/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    """작업 상태 조회"""
    if task_id not in tasks_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )

    task = tasks_status[task_id]

    # 큐 위치 확인
    queue_position = None
    if task["status"] == "queued":
        queue_position = get_task_queue_position(task_id)

    return TaskStatus(
        task_id=task_id,
        status=task["status"],
        message=task["message"],
        file_name=task["file_name"],
        download_url=task.get("download_url"),
        created_at=task["created_at"],
        progress=task.get("progress"),
        queue_position=queue_position,
    )


@app.get("/download/{task_id}")
async def download_translated_file(task_id: str):
    """번역된 파일 다운로드"""
    if task_id not in tasks_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )

    task = tasks_status[task_id]

    if task["status"] != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Translation not completed"
        )

    if "output_gcs_key" not in task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Translation file not found"
        )

    try:
        # GCS에서 파일을 임시로 다운로드
        gcs_manager = get_gcs_manager()
        temp_path = gcs_manager.download_to_temp(task["output_gcs_key"])

        if not temp_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Translation file not found in GCS",
            )

        # 파일을 바이트로 읽어서 응답
        with open(temp_path, "rb") as f:
            file_content = f.read()

        # 임시 파일 정리
        cleanup_temp_file(temp_path)

        # 파일명을 안전하게 인코딩
        original_filename = task["file_name"].replace(".pdf", "_translated.pdf")
        encoded_filename = quote(original_filename)

        return Response(
            content=file_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Content-Length": str(len(file_content)),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading file for task {task_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File download error",
        )


@app.get("/tasks")
async def list_tasks():
    """모든 작업 목록 조회"""
    queue_status = queue_manager.get_queue_status()
    return {
        "tasks": tasks_status,
        "total_tasks": len(tasks_status),
        "queue_status": queue_status,
    }


@app.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    """작업 삭제"""
    if task_id not in tasks_status:
        return {"message": "Task already deleted"}

    task = tasks_status[task_id]

    try:
        gcs_manager = get_gcs_manager()

        # GCS에서 입력 파일 삭제
        if "input_gcs_key" in task:
            success = gcs_manager.delete_file(task["input_gcs_key"])
            if not success:
                logger.warning(f"Failed to delete input file: {task['input_gcs_key']}")
        else:
            logger.info(f"input_gcs_key not found for task {task_id}")

        # GCS에서 출력 파일들 삭제 (디렉터리 전체)
        if "output_gcs_prefix" in task:
            success = gcs_manager.delete_files_with_prefix(task["output_gcs_prefix"])
            if success:
                logger.info(
                    f"Deleted output files from GCS with prefix: {task['output_gcs_prefix']}"
                )
            else:
                logger.warning(
                    f"Failed to delete output files with prefix: {task['output_gcs_prefix']}"
                )
        elif "output_gcs_key" in task:
            success = gcs_manager.delete_file(task["output_gcs_key"])
            if success:
                logger.info(f"Deleted output file from GCS: {task['output_gcs_key']}")
            else:
                logger.warning(
                    f"Failed to delete output file: {task['output_gcs_key']}"
                )
        else:
            logger.info(f"No output files found for task {task_id}")

    except Exception as e:
        logger.error(f"GCS file delete error for task {task_id}: {e}")

    # 작업 관련 임시 파일들 정리
    cleanup_task_related_temp_files(task_id)

    del tasks_status[task_id]
    logger.info(f"Task {task_id} deleted")
    return {"message": "Task deleted"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
