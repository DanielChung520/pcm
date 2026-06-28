import { useRef, useEffect } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const WS_URL = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/terminal`;

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      theme: {
        background: "#0a0e14",
        foreground: "#a9dc76",
        cursor: "#a9dc76",
        selectionBackground: "rgba(99, 102, 241, 0.3)",
      },
      cursorBlink: true,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    requestAnimationFrame(() => { try { fitAddon.fit(); } catch {} });

    termRef.current = term;

    // Connect WebSocket
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => { term.write(""); };
      ws.onmessage = (ev) => term.write(ev.data);
      ws.onclose = () => term.writeln("\r\n\x1b[31m[disconnected]\x1b[0m");
      ws.onerror = () => term.writeln("\r\n\x1b[31m[connection error]\x1b[0m");
      wsRef.current = ws;
    } catch {
      term.writeln("\r\n\x1b[31m[WebSocket not available]\x1b[0m");
    }

    // Send input to WebSocket
    const keyDisposable = term.onKey((e) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(e.key);
      }
    });

    // Paste support
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.ctrlKey && e.key === "v") {
        navigator.clipboard.readText().then(text => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(text);
        });
        return false;
      }
      return true;
    });

    // Resize
    const resizeObserver = new ResizeObserver(() => { fitAddon.fit(); });
    resizeObserver.observe(containerRef.current);

    return () => {
      keyDisposable.dispose();
      resizeObserver.disconnect();
      ws?.close();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="terminal-title">Terminal — ~/.pcm/workspace</span>
      </div>
      <div className="terminal-wrapper">
        <div ref={containerRef} className="terminal-container" />
      </div>
    </div>
  );
}
