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
    let cancelled = false;

    // WebSocket connection
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      if (cancelled) { ws.close(); return; }
      term.focus();
      term.write("\r\n\x1b[32m[connected]\x1b[0m\r\n");
    };
    ws.onmessage = (ev) => { if (!cancelled) term.write(ev.data); };
    ws.onclose = () => { if (!cancelled) term.writeln("\r\n\x1b[31m[disconnected]\x1b[0m"); };

    // Send terminal input to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Resize observer: fit xterm + send new dimensions to PTY
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        try {
          const cols = term.cols;
          const rows = term.rows;
          ws.send(`\x00SIZE:${cols},${rows}`);
        } catch {}
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      ws.close();
      setTimeout(() => { term.dispose(); termRef.current = null; }, 100);
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
