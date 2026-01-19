"""
日志配置模块

配置项目日志系统，包括控制台和文件输出
"""

import logging
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional


def setup_logging(
    log_level: str = "INFO",
    log_format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    log_file: Optional[str] = None,
    log_dir: str = "logs"
) -> None:
    """
    配置日志系统

    Args:
        log_level: 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_format: 日志格式
        log_file: 日志文件名（默认使用时间戳）
        log_dir: 日志目录
    """
    # 创建日志目录（相对于 agent_system）
    log_path = Path(__file__).parent.parent / log_dir
    log_path.mkdir(exist_ok=True)

    # 生成日志文件名
    if log_file is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = f"agent_{timestamp}.log"

    log_file_path = log_path / log_file

    # 获取根日志记录器
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # 清除现有的 handlers
    root_logger.handlers.clear()

    # 创建格式化器
    formatter = logging.Formatter(log_format)

    # 1. 控制台处理器 (带颜色)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # 2. 文件处理器 (所有级别)
    file_handler = logging.FileHandler(
        log_file_path,
        mode='a',
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)  # 文件记录所有级别
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    # 3. 错误文件处理器 (只记录 ERROR 及以上)
    error_file_handler = logging.FileHandler(
        log_path / f"error_{log_file}",
        mode='a',
        encoding='utf-8'
    )
    error_file_handler.setLevel(logging.ERROR)
    error_file_handler.setFormatter(formatter)
    root_logger.addHandler(error_file_handler)

    # 记录初始化信息
    root_logger.info("=" * 60)
    root_logger.info(f"Logging initialized. Level: {log_level}")
    root_logger.info(f"Log file: {log_file_path.absolute()}")
    root_logger.info("=" * 60)


def get_logger(name: str) -> logging.Logger:
    """
    获取日志记录器

    Args:
        name: 日志记录器名称

    Returns:
        logging.Logger: 日志记录器实例
    """
    return logging.getLogger(name)


class RequestLogger:
    """请求日志记录器 - 用于记录API请求和响应"""

    def __init__(self, logger: logging.Logger):
        self.logger = logger

    def log_request(
        self,
        api_name: str,
        method: str,
        url: Optional[str] = None,
        params: Optional[dict] = None,
        body: Optional[dict] = None,
        headers: Optional[dict] = None
    ):
        """
        记录API请求

        Args:
            api_name: API名称 (如 "LLM", "XHS")
            method: 请求方法
            url: 请求URL
            params: 查询参数
            body: 请求体
            headers: 请求头（敏感信息已脱敏）
        """
        self.logger.info(f"[{api_name}] Request: {method}")
        if url:
            self.logger.debug(f"[{api_name}] URL: {url}")

        if params:
            # 限制参数长度
            params_str = str(params)
            if len(params_str) > 500:
                params_str = params_str[:500] + "...(truncated)"
            self.logger.debug(f"[{api_name}] Params: {params_str}")

        if body:
            # 限制body长度并脱敏敏感信息
            body_str = self._sanitize_body(str(body))
            if len(body_str) > 1000:
                body_str = body_str[:1000] + "...(truncated)"
            self.logger.debug(f"[{api_name}] Body: {body_str}")

        if headers:
            # 脱敏headers
            safe_headers = self._sanitize_headers(headers)
            self.logger.debug(f"[{api_name}] Headers: {safe_headers}")

    def log_response(
        self,
        api_name: str,
        status: Optional[int] = None,
        body: Optional[dict] = None,
        error: Optional[str] = None,
        duration_ms: Optional[float] = None
    ):
        """
        记录API响应

        Args:
            api_name: API名称
            status: HTTP状态码
            body: 响应体
            error: 错误信息
            duration_ms: 请求耗时（毫秒）
        """
        if error:
            self.logger.error(f"[{api_name}] Error: {error}")
        elif status:
            log_level = logging.WARNING if status >= 400 else logging.INFO
            self.logger.log(log_level, f"[{api_name}] Response: Status {status}")
        else:
            self.logger.info(f"[{api_name}] Response received")

        if duration_ms is not None:
            self.logger.debug(f"[{api_name}] Duration: {duration_ms:.2f}ms")

        if body:
            # 限制响应体长度
            body_str = str(body)
            if len(body_str) > 1000:
                body_str = body_str[:1000] + "...(truncated)"
            self.logger.debug(f"[{api_name}] Body: {body_str}")

    def _sanitize_body(self, body: str) -> str:
        """脱敏请求体中的敏感信息"""
        sensitive_keys = ['api_key', 'token', 'password', 'secret', 'auth']
        result = body.lower()
        for key in sensitive_keys:
            if key in result:
                return f"{body[:100]}...[REDACTED]..."
        return body

    def _sanitize_headers(self, headers: dict) -> dict:
        """脱敏headers中的敏感信息"""
        sensitive_keys = ['authorization', 'api-key', 'x-api-key']
        safe_headers = {}
        for k, v in headers.items():
            if k.lower() in sensitive_keys:
                safe_headers[k] = "***REDACTED***"
            else:
                safe_headers[k] = v
        return safe_headers
