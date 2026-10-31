export type SSEEventHandler<T = unknown> = (event: T) => void;

export function createSSEParser<T = unknown>(onEvent: SSEEventHandler<T>) {
  let buffer = "";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (!dataLines.length) return;
    const data = dataLines.join("\n");
    dataLines = [];
    let event: T;
    try {
      event = JSON.parse(data) as T;
    } catch {
      // 畸形帧不能影响后续完整事件，调用方会检查是否收到了终态。
      return;
    }
    onEvent(event);
  };

  const parseLine = (line: string) => {
    const normalized = line.replace(/\r$/, "");
    if (!normalized) {
      dispatch();
    } else if (normalized.startsWith("data:")) {
      dataLines.push(normalized.slice(5).replace(/^ /, ""));
    }
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(parseLine);
    },
    end() {
      if (buffer.trim()) parseLine(buffer);
      buffer = "";
      dispatch();
    },
  };
}
