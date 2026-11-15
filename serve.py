"""免安裝版本的本機伺服器（只用 Python 標準函式庫）。

用法：在專案根目錄執行  python serve.py  ，再開 http://127.0.0.1:5174/
- 根目錄 / 會開 cdn.html（CDN 版本，不需要 npm install）
- /models/... 等網址找不到時，改從 public/ 底下找（和 Vite 的 public 資料夾行為一樣）
- 關閉快取，改完程式重新整理就會生效
"""
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5174
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".ts": "text/plain; charset=utf-8",
        ".tsx": "text/plain; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".glb": "model/gltf-binary",
    }

    def translate_path(self, path):
        if path.split("?", 1)[0] in ("/", "/index.html"):
            path = "/cdn.html"
        local = super().translate_path(path)
        if not os.path.exists(local):
            alt = os.path.join(ROOT, "public", os.path.relpath(local, ROOT))
            if os.path.exists(alt):
                return alt
        return local

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Handler, directory=ROOT))
    print(f"免安裝版本：http://127.0.0.1:{PORT}/   （Ctrl+C 結束）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
