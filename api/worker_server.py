from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
import os
import asyncio
import httpx
import logging
from pathlib import Path
import gc
import psutil
from typing import Optional
import tempfile
from contextlib import asynccontextmanager
from gcs_utils import get_gcs_manager, cleanup_temp_file, cleanup_temp_directory
import threading
import signal
import sys
from dotenv import load_dotenv

load_dotenv()

# Babeldoc imports
from babeldoc.translator.translator import OpenAITranslator, set_translate_rate_limiter
from babeldoc.format.pdf.translation_config import TranslationConfig, WatermarkOutputMode
from babeldoc.docvision.doclayout import DocLayoutModel
import babeldoc.format.pdf.high_level
import babeldoc

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Disable verbose logging from external libraries
for logger_name in ["httpx", "openai", "httpcore", "urllib3"]:
    logging.getLogger(logger_name).setLevel(logging.WARNING)
    logging.getLogger(logger_name).propagate = False

# 환경 변수 설정
MAIN_SERVER_URL = os.getenv("MAIN_SERVER_URL", "http://localhost:8000")
TASK_TIMEOUT_SECONDS = int(os.getenv("TASK_TIMEOUT_SECONDS", "1800"))  # 30분

MODEL_PRESETS = {
    "OpenAI": {
        "base_url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        "api_key": os.getenv("OPENAI_API_KEY"),
        "default_model": os.getenv("OPENAI_DEFAULT_MODEL", "gpt-4o-mini"),
    },
}

# 서버리스 환경을 위한 단순화된 리소스 관리
class ResourceManager:
    def __init__(self):
        self.doc_layout_model = None
        self.lock = threading.Lock()
        self.current_task_id = None
    
    def get_doc_layout_model(self):
        """레이지 로딩 방식으로 DocLayoutModel 반환"""
        with self.lock:
            if self.doc_layout_model is None:
                try:
                    self.doc_layout_model = DocLayoutModel.load_onnx()
                    logger.info("DocLayoutModel initialized")
                except Exception as e:
                    logger.error(f"Failed to initialize DocLayoutModel: {e}")
                    raise
            return self.doc_layout_model
    
    def cleanup_model(self):
        """모델 정리"""
        with self.lock:
            if self.doc_layout_model is not None:
                try:
                    if hasattr(self.doc_layout_model, "model"):
                        del self.doc_layout_model.model
                    del self.doc_layout_model
                    self.doc_layout_model = None
                    logger.info("DocLayoutModel cleaned up")
                except Exception as e:
                    logger.error(f"Error cleaning up DocLayoutModel: {e}")
    
    def set_current_task(self, task_id: str):
        """현재 처리 중인 작업 설정"""
        with self.lock:
            self.current_task_id = task_id
    
    def clear_current_task(self):
        """현재 처리 중인 작업 클리어"""
        with self.lock:
            self.current_task_id = None
    
    def get_current_task(self) -> Optional[str]:
        """현재 처리 중인 작업 반환"""
        with self.lock:
            return self.current_task_id
    
    def cleanup_after_task(self):
        """작업 완료 후 정리 (서버리스 환경에서 매번 실행)"""
        try:
            # 가비지 컬렉션 실행
            gc.collect()
            
            # 메모리 사용량 로그
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / 1024 / 1024
            
            logger.info(f"Memory usage before cleanup: {memory_mb:.2f} MB")
            
            # 서버리스 환경에서는 매번 모델 정리
            self.cleanup_model()
            
            # 정리 후 메모리 사용량 확인
            gc.collect()
            memory_info = process.memory_info()
            memory_mb_after = memory_info.rss / 1024 / 1024
            
            logger.info(f"Memory usage after cleanup: {memory_mb_after:.2f} MB (freed: {memory_mb - memory_mb_after:.2f} MB)")
            
        except Exception as e:
            logger.error(f"Error in cleanup after task: {e}")
    
    def check_memory_usage(self) -> dict:
        """현재 메모리 사용량 체크 (모니터링용)"""
        try:
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / 1024 / 1024
            
            return {
                "memory_usage_mb": memory_mb,
            }
        except Exception as e:
            logger.error(f"Error checking memory usage: {e}")
            return {"error": str(e)}

# 글로벌 리소스 매니저
resource_manager = ResourceManager()

class TranslationRequest(BaseModel):
    task_id: str
    input_gcs_key: str
    output_gcs_prefix: str
    lang_out: str
    no_dual: bool
    file_name: str

@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 생명주기 관리"""
    logger.info("Starting BabelDOC PDF Translation Worker (Serverless)")
    
    # Babeldoc 초기화
    try:
        babeldoc.format.pdf.high_level.init()
        logger.info("Babeldoc initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Babeldoc: {e}")
        raise
    
    yield
    
    # 정리 작업
    logger.info("Shutting down BabelDOC PDF Translation Worker")
    resource_manager.cleanup_model()
    
    # 현재 작업 정리
    current_task = resource_manager.get_current_task()
    if current_task:
        logger.info(f"Cleaning up current task: {current_task}")
        resource_manager.clear_current_task()

app = FastAPI(
    title="BabelDOC PDF Translation Worker", 
    version="1.0.0",
    lifespan=lifespan
)

async def update_main_server_status(
    task_id: str, 
    status: str, 
    message: str, 
    output_gcs_key: Optional[str] = None,
    progress: Optional[float] = None
):
    """메인 서버에 상태 업데이트"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            data = {
                "task_id": task_id,
                "status_str": status,
                "message": message
            }
            if output_gcs_key:
                data["output_gcs_key"] = output_gcs_key
            if progress is not None:
                data["progress"] = progress
            
            response = await client.post(
                f"{MAIN_SERVER_URL}/update_task_status",
                data=data
            )
            
            if response.status_code == 200:
                logger.debug(f"Status updated for task {task_id}: {status}")
            elif response.status_code == 404:
                logger.info(f"Task {task_id} not found in main server, cancelling task")
                raise asyncio.CancelledError(f"Task {task_id} not found in main server")
            else:
                logger.error(f"Failed to update status for task {task_id}: {response.status_code}")
                raise asyncio.CancelledError(f"Main server returned error {response.status_code} for task {task_id}")
    
    except httpx.TimeoutException:
        logger.error(f"Timeout updating status for task {task_id}")
        raise asyncio.CancelledError(f"Timeout updating status for task {task_id}")
    except asyncio.CancelledError:
        # Re-raise CancelledError to maintain cancellation chain
        raise
    except Exception as e:
        logger.error(f"Error updating main server status: {e}")
        raise asyncio.CancelledError(f"Error updating main server status for task {task_id}: {str(e)}")

async def run_babeldoc_translation(
    input_gcs_key: str,
    output_gcs_prefix: str,
    model_name: str,
    base_url: str,
    api_key: str,
    lang_out: str,
    no_dual: bool,
    task_id: str,
):
    """babeldoc 번역 실행"""
    temp_input_path = None
    temp_output_dir = None
    translator = None
    
    # 태스크마다 progress 초기화
    last_progress = -1.0  # 첫 번째 업데이트를 위해 -1로 설정
    
    try:
        # GCS에서 입력 파일 다운로드
        gcs_manager = get_gcs_manager()
        temp_input_path = gcs_manager.download_to_temp(input_gcs_key)
        
        if not temp_input_path:
            raise Exception(f"Failed to download input file from GCS: {input_gcs_key}")
        
        # 임시 출력 디렉토리 생성
        temp_output_dir = tempfile.mkdtemp(prefix=f"babeldoc_{task_id}_")
        logger.info(f"Created temp output directory: {temp_output_dir}")
        
        # DocLayoutModel 가져오기
        doc_layout_model = resource_manager.get_doc_layout_model()

        # Initialize translator
        translator = OpenAITranslator(
            lang_in="auto",
            lang_out=lang_out,
            model=model_name,
            base_url=base_url,
            api_key=api_key,
            ignore_cache=True,
        )

        # Set translation rate limiter
        set_translate_rate_limiter(4)  # QPS limit

        # Create translation config
        config = TranslationConfig(
            input_file=temp_input_path,
            font=None,
            pages=None,  # Translate all pages
            output_dir=temp_output_dir,
            translator=translator,
            debug=False,
            lang_in="auto",
            lang_out=lang_out,
            no_dual=no_dual,
            no_mono=False,
            qps=4,
            formular_font_pattern=None,
            formular_char_pattern=None,
            split_short_lines=False,
            short_line_split_factor=0.8,
            doc_layout_model=doc_layout_model,
            skip_clean=False,
            dual_translate_first=False,
            disable_rich_text_translate=False,
            enhance_compatibility=False,
            use_alternating_pages_dual=False,
            report_interval=0.1,
            min_text_length=1,
            watermark_output_mode=WatermarkOutputMode.NoWatermark,
            split_strategy=TranslationConfig.create_max_pages_per_part_split_strategy(50),
            table_model=None,
            show_char_box=False,
            skip_scanned_detection=True,
            ocr_workaround=False,
            custom_system_prompt=None,
            working_dir=None,
            add_formula_placehold_hint=False,
            glossaries=[],
            pool_max_workers=None,
            auto_extract_glossary=True,
            auto_enable_ocr_workaround=False,
            primary_font_family=None,
            only_include_translated_page=False,
            save_auto_extracted_glossary=False,
        )

        # Update status to processing
        await update_main_server_status(task_id, "processing", "Translation started", progress=0.0)

        # Run translation with timeout
        try:
            async with asyncio.timeout(TASK_TIMEOUT_SECONDS):
                async for event in babeldoc.format.pdf.high_level.async_translate(config):
                    if event["type"] == "error":
                        logger.error(f"Translation error: {event['error']}")
                        await update_main_server_status(
                            task_id, 
                            "failed", 
                            f"Translation error: {event['error']}"
                        )
                        return False, f"Translation error: {event['error']}", None
                    
                    elif event["type"] == "finish":
                        result = event["translate_result"]
                        logger.info(f"Translation completed: {result}")
                        
                        # 번역 완료된 파일을 GCS에 업로드
                        pdf_files = sorted(
                            [f for f in os.listdir(temp_output_dir) if f.endswith(".pdf")],
                            key=lambda x: os.path.getmtime(os.path.join(temp_output_dir, x)),
                            reverse=True,
                        )
                        
                        if pdf_files:
                            output_file_path = os.path.join(temp_output_dir, pdf_files[0])
                            output_gcs_key = f"{output_gcs_prefix}/{pdf_files[0]}"
                            
                            # GCS에 업로드
                            if gcs_manager.upload_file(output_file_path, output_gcs_key):
                                logger.info(f"Output file uploaded to GCS: {output_gcs_key}")
                                return True, "Translation completed", output_gcs_key
                            else:
                                logger.error(f"Failed to upload output file to GCS: {output_gcs_key}")
                                return False, "Failed to upload output file to GCS", None
                        else:
                            logger.error("No PDF files found in output directory")
                            return False, "No PDF files found in output directory", None
                    
                    elif event["type"] == "progress_update":
                        # Update progress only if it changed significantly (1% threshold)
                        current_progress = event.get("overall_progress", 0)
                        
                        # 처음 업데이트이거나, 1% 이상 변했을 때만 업데이트
                        if abs(current_progress - last_progress) >= 1.0:
                            await update_main_server_status(
                                task_id, 
                                "processing", 
                                f"Translating... {current_progress:.1f}%", 
                                progress=current_progress
                            )
                            last_progress = current_progress
        
        except asyncio.TimeoutError:
            logger.error(f"Translation timeout for task {task_id}")
            await update_main_server_status(task_id, "failed", "Translation timeout")
            return False, "Translation timeout", None

        return True, "Translation completed", None

    except Exception as e:
        logger.error(f"Translation failed for task {task_id}: {str(e)}")
        await update_main_server_status(task_id, "failed", f"Translation error: {str(e)}")
        return False, f"Translation error: {str(e)}", None

    finally:
        # 리소스 정리
        cleanup_resources = []
        
        # 임시 파일 정리
        if temp_input_path:
            cleanup_resources.append(("temp_input_file", temp_input_path))
        
        if temp_output_dir:
            cleanup_resources.append(("temp_output_dir", temp_output_dir))
        
        # 번역기 정리
        if translator and hasattr(translator, "client"):
            try:
                if hasattr(translator.client, "http_client"):
                    await translator.client.http_client.aclose()
                logger.debug("Translator client closed")
            except Exception as e:
                logger.error(f"Error closing translator client: {e}")
        
        # 정리 작업 수행
        for resource_type, resource_path in cleanup_resources:
            try:
                if resource_type == "temp_input_file":
                    cleanup_temp_file(resource_path)
                elif resource_type == "temp_output_dir":
                    cleanup_temp_directory(resource_path)
                logger.debug(f"Cleaned up {resource_type}: {resource_path}")
            except Exception as e:
                logger.error(f"Error cleaning up {resource_type} {resource_path}: {e}")
        
        # 가비지 컬렉션 (가벼운 정리)
        gc.collect()

async def process_translation_task(request: TranslationRequest):
    """번역 작업 처리 (서버리스 환경에서 단일 작업만 처리)"""
    task_start_time = asyncio.get_event_loop().time()
    
    # 현재 작업 설정
    resource_manager.set_current_task(request.task_id)
    
    try:
        provider = "OpenAI"
        model_config = MODEL_PRESETS[provider]
        
        if not model_config["api_key"]:
            await update_main_server_status(
                request.task_id, 
                "failed", 
                "OpenAI API key not configured"
            )
            return
        
        success, message, output_gcs_key = await run_babeldoc_translation(
            request.input_gcs_key,
            request.output_gcs_prefix,
            model_config["default_model"],
            model_config["base_url"],
            model_config["api_key"],
            request.lang_out,
            request.no_dual,
            request.task_id,
        )

        if success:
            if output_gcs_key:
                await update_main_server_status(
                    request.task_id, 
                    "completed", 
                    "Translation completed",
                    output_gcs_key,
                    progress=100.0
                )
                
                # 작업 완료 시간 로그
                task_duration = asyncio.get_event_loop().time() - task_start_time
                logger.info(f"Translation completed for task {request.task_id} in {task_duration:.2f}s")
            else:
                await update_main_server_status(
                    request.task_id, 
                    "failed", 
                    "Translation file not found"
                )
        else:
            await update_main_server_status(
                request.task_id, 
                "failed", 
                message
            )

    except Exception as e:
        logger.error(f"Error processing translation task {request.task_id}: {e}")
        await update_main_server_status(
            request.task_id, 
            "failed", 
            f"Translation error: {str(e)}"
        )
    
    finally:
        # 현재 작업 정리
        resource_manager.clear_current_task()
        
        # 작업 완료 후 메모리 정리 (서버리스 환경에서 매번 실행)
        resource_manager.cleanup_after_task()

@app.get("/")
async def root():
    return {
        "message": "BabelDOC PDF Translation Worker (Serverless)", 
        "version": "1.0.0",
        "status": "healthy"
    }

@app.get("/health")
async def health_check():
    memory_status = resource_manager.check_memory_usage()
    process = psutil.Process(os.getpid())
    
    return {
        "status": "healthy", 
        "timestamp": "now",
        "current_task": resource_manager.get_current_task(),
        "memory_status": memory_status,
        "cpu_percent": process.cpu_percent()
    }

@app.get("/stats")
async def get_stats():
    """서버 통계 정보"""
    memory_status = resource_manager.check_memory_usage()
    process = psutil.Process(os.getpid())
    
    return {
        "current_task": resource_manager.get_current_task(),
        "memory_status": memory_status,
        "cpu_percent": process.cpu_percent(),
        "task_timeout_seconds": TASK_TIMEOUT_SECONDS,
        "deployment_type": "serverless"
    }

@app.post("/process")
async def process_translation(request: TranslationRequest):
    """번역 작업 처리 요청 (서버리스 환경에서 단일 작업 처리)"""
    logger.info(f"Received translation request for task {request.task_id}")
    
    # 요청 유효성 검증
    if not request.task_id or not request.input_gcs_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required fields"
        )
    
    # 현재 처리 중인 작업이 있는지 확인 (서버리스에서는 보통 없지만 안전장치)
    current_task = resource_manager.get_current_task()
    if current_task:
        if current_task == request.task_id:
            logger.info(f"Task {request.task_id} is already being processed, skipping duplicate request")
            return {
                "message": "Task already being processed",
                "task_id": request.task_id
            }
        else:
            logger.warning(f"Task {current_task} is already processing, rejecting new task {request.task_id}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Worker is busy with task {current_task}"
            )
    
    # 동기적으로 번역 작업 처리 (서버리스에서는 응답을 기다림)
    await process_translation_task(request)
    
    return {
        "message": "Translation processed", 
        "task_id": request.task_id
    }

def signal_handler(signum, frame):
    """시그널 핸들러"""
    logger.info(f"Received signal {signum}, shutting down gracefully...")
    
    # 현재 작업 정리
    current_task = resource_manager.get_current_task()
    if current_task:
        logger.info(f"Cancelling current task: {current_task}")
        resource_manager.clear_current_task()
    
    # 리소스 정리
    resource_manager.cleanup_model()
    sys.exit(0)

if __name__ == "__main__":
    # 시그널 핸들러 등록
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Babeldoc 오프라인 에셋 초기화
    try:
        assets_path = Path("/app/")
        babeldoc.assets.assets.generate_offline_assets_package(assets_path)
        babeldoc.assets.assets.restore_offline_assets_package(assets_path)
        logger.info("Babeldoc offline assets initialized")
    except Exception as e:
        logger.error(f"Failed to initialize Babeldoc offline assets: {e}")
    
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
