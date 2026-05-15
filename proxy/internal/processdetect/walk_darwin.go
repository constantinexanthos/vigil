//go:build darwin

// walk_darwin.go implements socket→PID resolution and PID→process
// tree walking on macOS.
//
// Socket→PID
// ----------
//
// macOS does not expose a stable, root-free "give me the PID that
// owns this TCP endpoint" syscall in a way that's accessible from
// pure Go. The supported routes are:
//
//   - libproc's proc_listpids + proc_pidfdinfo (private framework,
//     cgo or hand-rolled asm trampoline required), or
//   - lsof(8), which is preinstalled on every Mac and uses the
//     kernel's proc_listpids machinery under the hood.
//
// We pick lsof. The detector caps its runtime at 50ms; lsof returns
// in well under that for a single port query. Pure-Go alternatives
// (parsing /usr/sbin/sysctl or sniffing the in-kernel PCB list) are
// either undocumented or require root.
//
// Permission model: lsof for own-user processes works without root.
// Sandboxed apps (Mac App Store distributions, sometimes Cursor.app)
// may not surface in lsof's enumeration; in that case we get an
// empty result and gracefully fall through to anonymous attribution.
//
// PID→process tree
// ----------------
//
// We use unix.SysctlKinfoProc({"kern.proc.pid", pid}) to get PID,
// PPID, and the (truncated) Comm. For the full executable path we
// query KERN_PROCARGS2 via unix.SysctlRaw — the first 4 bytes are the
// argc; the next null-terminated string is the executable path; the
// remaining null-terminated tokens are argv. This is the same
// mechanism `ps` uses for the WIDE column on macOS.

package processdetect

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"golang.org/x/sys/unix"
)

// platformResolveRemotePID returns the PID that owns the TCP socket
// with the given local and remote ports. The connection direction is:
// the proxy listens on localPort and accepted a connection whose peer
// reports remotePort as its source. We need the PID at the client
// side of that pairing — i.e. the process bound to the ephemeral
// source port `remotePort` on the loopback interface.
//
// Implementation: invoke `lsof -nP -iTCP:<remotePort>` and parse the
// PID from the first non-header line whose connection string contains
// the localPort. Both ports appear in lsof's `NAME` column as
// `127.0.0.1:remote->127.0.0.1:local (ESTABLISHED)` — we match on the
// inversion so we only attribute to the client process, not the proxy
// itself (the proxy also has an entry on the same port pair).
func platformResolveRemotePID(localPort, remotePort int) (int, error) {
	// -F p prints "p<pid>\n" lines, one per matched FD. -F n adds
	// "n<endpoint>\n" right after each "p<pid>". Combined: pairs of
	// (pid, endpoint) lines we can scan in order.
	//
	// -sTCP:ESTABLISHED filters to established sockets, removing the
	// noise of LISTEN entries on the same port from prior detection
	// runs.
	cmd := exec.Command("lsof",
		"-nP",
		"-iTCP:"+strconv.Itoa(remotePort),
		"-sTCP:ESTABLISHED",
		"-Fpn",
	)
	out, err := cmd.Output()
	if err != nil {
		// lsof exits 1 when no matches; that's not an error from the
		// detector's perspective, it just means we can't attribute.
		if ee, ok := err.(*exec.ExitError); ok && ee.ExitCode() == 1 {
			return 0, nil
		}
		return 0, fmt.Errorf("lsof: %w", err)
	}

	// Parse "p<pid>" / "n<endpoint>" pairs. We accept a match when
	// endpoint contains "->127.x.x.x:<localPort>" — the peer side of
	// the ESTABLISHED entry. Self-loop entries (proxy ↔ proxy) show
	// up too with the same pid; we want the pid that is NOT us. The
	// caller already ruled out their own pid by knowing it's the
	// connection accepted at the proxy's listen port; here we just
	// pick the first PID whose ENDPOINT shows ->localPort, which by
	// construction is the client side.
	var currentPID int
	for _, line := range strings.Split(string(out), "\n") {
		if len(line) < 2 {
			continue
		}
		switch line[0] {
		case 'p':
			pid, err := strconv.Atoi(line[1:])
			if err != nil {
				continue
			}
			currentPID = pid
		case 'n':
			endpoint := line[1:]
			// We want the client side: its endpoint should look like
			//   <localIP>:<remotePort>-><localIP>:<localPort>
			// where remotePort is the client's ephemeral source port
			// and localPort is the proxy's listen port. The proxy's
			// own lsof entry has the inversion. Match by the arrow
			// direction.
			arrow := strings.Index(endpoint, "->")
			if arrow < 0 {
				continue
			}
			peer := endpoint[arrow+2:]
			peerPort, err := portFromEndpoint(peer)
			if err != nil {
				continue
			}
			if peerPort == localPort {
				return currentPID, nil
			}
		}
	}
	return 0, nil
}

// portFromEndpoint extracts the integer port from an `address:port`
// string. Handles bracketed IPv6 (`[::1]:5432`) and plain IPv4.
func portFromEndpoint(ep string) (int, error) {
	// Trim any trailing parens like " (ESTABLISHED)" — lsof -Fn
	// strips those but defense-in-depth.
	if i := strings.IndexByte(ep, ' '); i >= 0 {
		ep = ep[:i]
	}
	// Bracketed IPv6.
	if strings.HasPrefix(ep, "[") {
		if close := strings.Index(ep, "]:"); close >= 0 {
			return strconv.Atoi(ep[close+2:])
		}
	}
	// Plain host:port.
	if i := strings.LastIndexByte(ep, ':'); i >= 0 {
		return strconv.Atoi(ep[i+1:])
	}
	return 0, fmt.Errorf("no port in %q", ep)
}

// platformWalkProcessTree walks from pid up through its parents,
// returning ProcessInfo for each step. The walk terminates when:
//   - we reach PID 0 or 1 (kernel/launchd; nothing useful above), or
//   - a sysctl lookup fails (process exited mid-walk), or
//   - we hit 64 levels (defense against pathological cycles).
//
// The first element of the returned slice is the leaf (the calling
// process); the last is the highest ancestor we resolved.
func platformWalkProcessTree(pid int) ([]ProcessInfo, error) {
	const maxDepth = 64
	chain := make([]ProcessInfo, 0, 8)
	current := pid
	for i := 0; i < maxDepth && current > 1; i++ {
		info, err := readProcessInfo(current)
		if err != nil {
			// Best-effort: if the leaf failed, surface that as an
			// empty chain to the caller; if a mid-chain process
			// vanished we just stop walking up.
			if i == 0 {
				return nil, err
			}
			break
		}
		chain = append(chain, info)
		if info.PPID == 0 || info.PPID == current {
			break
		}
		current = info.PPID
	}
	return chain, nil
}

func readProcessInfo(pid int) (ProcessInfo, error) {
	kp, err := unix.SysctlKinfoProc("kern.proc.pid", pid)
	if err != nil {
		return ProcessInfo{}, fmt.Errorf("kern.proc.pid %d: %w", pid, err)
	}
	// P_comm is a fixed-size [17]byte; trim at the first null.
	comm := nullTerm(kp.Proc.P_comm[:])
	ppid := int(kp.Eproc.Ppid)
	// Full path from KERN_PROCARGS2. Best-effort: if the read fails
	// (zombies, permission, very-early-startup), keep the comm and
	// move on.
	path, args := readProcArgs(pid)
	if path == "" {
		path = comm
	}
	return ProcessInfo{
		PID:        pid,
		PPID:       ppid,
		Name:       filepath.Base(strings.TrimSpace(path)),
		Path:       path,
		CmdlineRaw: args,
	}, nil
}

// readProcArgs returns the executable path and the joined argv for
// the given pid by reading KERN_PROCARGS2. Returns ("","") on any
// error — the caller falls back to P_comm.
//
// Layout of KERN_PROCARGS2 buffer:
//
//	4 bytes  argc (int32, native byte order on macOS = little-endian)
//	N bytes  exec path, null-terminated
//	pad      run of NULs to align argv
//	argv[0]\0argv[1]\0... (argc strings total)
//	envp[0]\0envp[1]\0...
func readProcArgs(pid int) (path string, argsJoined string) {
	// kern.procargs2 takes the pid as its single int argument and
	// returns the procargs2 buffer described above. x/sys/unix's
	// SysctlRaw handles the string→MIB lookup and the two-pass size-
	// then-read for us.
	buf, err := unix.SysctlRaw("kern.procargs2", pid)
	if err != nil || len(buf) < 4 {
		return "", ""
	}
	argc := int(binary.LittleEndian.Uint32(buf[:4]))
	rest := buf[4:]
	// First null-terminated string is the exec path.
	pathEnd := bytes.IndexByte(rest, 0)
	if pathEnd < 0 {
		return "", ""
	}
	path = string(rest[:pathEnd])
	rest = rest[pathEnd+1:]
	// Skip alignment padding.
	for len(rest) > 0 && rest[0] == 0 {
		rest = rest[1:]
	}
	// Collect argc tokens.
	args := make([]string, 0, argc)
	for i := 0; i < argc && len(rest) > 0; i++ {
		end := bytes.IndexByte(rest, 0)
		if end < 0 {
			args = append(args, string(rest))
			break
		}
		args = append(args, string(rest[:end]))
		rest = rest[end+1:]
	}
	return path, strings.Join(args, " ")
}

func nullTerm(b []byte) string {
	if i := bytes.IndexByte(b, 0); i >= 0 {
		return string(b[:i])
	}
	return string(b)
}
