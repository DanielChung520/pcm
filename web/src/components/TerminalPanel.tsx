import { useRef, useEffect } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const CWD = "~/.pcm/workspace";
const PROMPT = "\x1b[32mpcm\x1b[0m@local \x1b[34m" + CWD + "\x1b[0m $ ";

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

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

    // Defer fit until the render service is fully initialized
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // dimensions not ready yet — will fit on resize observer
      }
    });

    termRef.current = term;

    // Welcome banner
    term.writeln("\x1b[1;36m");
    term.writeln("  ___  ___ ___ _  _ _  _ ___    ___ ___ ");
    term.writeln(" | _ \\/ __| __| \\| | \\| | _ \\  / __| _ \\");
    term.writeln(" |  _/ (__| _|| .` | .` |   / | (__|   /");
    term.writeln(" |_|  \\___|___|_|\\_|_|\\_|_|_\\  \\___|_|_\\");
    term.writeln("\x1b[0m");
    term.writeln("");
    term.writeln("  PCM Terminal v0.1.0  |  Type 'help' for commands");
    term.writeln("  CWD: " + CWD);
    term.writeln("");

    let line = "";
    term.write(PROMPT);

    const handleKey = (e: { key: string; domEvent: KeyboardEvent }) => {
      const ev = e.domEvent;

      if (ev.key === "Enter") {
        term.writeln("");
        processCommand(line.trim());
        line = "";
        term.write(PROMPT);
      } else if (ev.key === "Backspace") {
        if (line.length > 0) {
          line = line.slice(0, -1);
          term.write("\b \b");
        }
      } else if (ev.key === "l" && ev.ctrlKey) {
        term.clear();
        term.write(PROMPT + line);
      } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        line += ev.key;
        term.write(ev.key);
      }
    };

    const processCommand = (cmd: string) => {
      if (!cmd) return;
      const [base, ...args] = cmd.split(/\s+/);

      switch (base) {
        case "help":
          term.writeln("  \x1b[33mAvailable commands:\x1b[0m");
          term.writeln("    help              Show this help");
          term.writeln("    ls                List workspace contents");
          term.writeln("    pcm list          List PCM projects");
          term.writeln("    pcm scan <proj>   Scan a project");
          term.writeln("    pcm status        Show engine status");
          term.writeln("    pcm graph <proj>  Show dependency graph");
          term.writeln("    clear             Clear terminal");
          term.writeln("    whoami            Show current user");
          term.writeln("    echo <text>       Echo text");
          term.writeln("    date              Show current date");
          break;
        case "ls":
          term.writeln("  core/  scanner/  cli/  mcp-server/  storage/  engine/");
          break;
        case "pcm":
          if (args[0] === "list") {
            term.writeln("  \x1b[36mpcm-core\x1b[0m      TypeScript  42 files  218 symbols");
            term.writeln("  \x1b[36mpcm-scanner\x1b[0m  TypeScript  38 files  187 symbols");
            term.writeln("  \x1b[36mpcm-engine\x1b[0m   Rust        24 files   96 symbols");
            term.writeln("  \x1b[36mpcm-analyzer\x1b[0m Python      31 files  154 symbols");
            term.writeln("  \x1b[36mpcm-cli\x1b[0m      TypeScript  18 files   73 symbols");
          } else if (args[0] === "scan") {
            if (args[1]) {
              term.writeln("  \x1b[33mScanning " + args[1] + "...\x1b[0m");
              term.writeln("  [##########] 100%");
              term.writeln("  \x1b[32mDone. 42 files, 218 symbols found.\x1b[0m");
            } else {
              term.writeln("  \x1b[31mError: specify a project name\x1b[0m");
            }
          } else if (args[0] === "status") {
            term.writeln("  \x1b[32mEngine:  Ready\x1b[0m");
            term.writeln("  Storage: 847 MB / 4096 MB");
            term.writeln("  CPU:     23%");
            term.writeln("  Memory:  312 MB");
          } else if (args[0] === "graph") {
            if (args[1]) {
              term.writeln("  \x1b[33mDependency graph for " + args[1] + ":\x1b[0m");
              term.writeln("  core/index --> core/model, core/events");
              term.writeln("  scanner/index --> scanner/parser, scanner/analyzer");
              term.writeln("  cli/commands --> scanner/index, core/config");
            } else {
              term.writeln("  \x1b[31mError: specify a project name\x1b[0m");
            }
          } else {
            term.writeln("  \x1b[31mUnknown pcm command: " + (args[0] || "") + "\x1b[0m");
          }
          break;
        case "clear":
          term.clear();
          break;
        case "whoami":
          term.writeln("  daniel");
          break;
        case "echo":
          term.writeln("  " + args.join(" "));
          break;
        case "date":
          term.writeln("  " + new Date().toString());
          break;
        default:
          term.writeln("  \x1b[31mcommand not found: " + base + "\x1b[0m  Type 'help' for commands.");
      }
    };

    const disposable = term.onData((data) => {
      // onData gives us raw data; we handle key events via onKey for better control
    });

    const keyDisposable = term.onKey(handleKey);

    // Responsive resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposable.dispose();
      keyDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="terminal-title">Terminal — {CWD}</span>
      </div>
      <div className="terminal-wrapper">
        <div ref={containerRef} className="terminal-container" />
      </div>
    </div>
  );
}