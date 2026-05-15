//go:build linux

// walk_linux.go implements socket→PID resolution and PID→process
// tree walking on Linux.
//
// Socket→PID
// ----------
//
// We read /proc/net/tcp (and /proc/net/tcp6, in case the connection
// is over the IPv6 loopback). Each line lists local/remote addresses,
// ports, and the socket inode owned by the kernel for that endpoint.
// We then scan /proc/<pid>/fd/* symlinks across the process table
// looking for a symlink whose target is "socket:[<inode>]" for the
// matching inode. The PID owning that fd is the client.
//
// This is the same mechanism `ss(8)` and `lsof(8)` use; it works
// without root for processes in the same uid, and the only cost is a
// linear scan of /proc/<pid>/fd which is bounded by the open-file
// budget of the host.
//
// PID→process tree
// ----------------
//
// /proc/<pid>/stat exposes (pid, comm in parens, state, ppid, ...);
// /proc/<pid>/exe is a symlink to the executable; /proc/<pid>/cmdline
// is the NUL-separated argv. All reads are best-effort: a vanished
// process or a permission denied just terminates the walk at the
// last successful step.

package processdetect

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// platformResolveRemotePID resolves (localPort, remotePort) → PID by
// pairing /proc/net/tcp{,6} entries with /proc/<pid>/fd symlinks.
//
// localPort is the proxy's listen port; remotePort is the ephemeral
// source port reported on the accepted socket. The client process
// bound that source port — we look for the inode whose local port
// matches remotePort and whose peer (the remote-half of /proc/net/tcp
// from the client's perspective) is localPort. From there we cross-
// reference the inode against /proc/<pid>/fd to find the owner.
func platformResolveRemotePID(localPort, remotePort int) (int, error) {
	inode, err := findSocketInode(remotePort, localPort)
	if err != nil {
		return 0, err
	}
	if inode == 0 {
		return 0, nil
	}
	return findPIDForInode(inode)
}

// findSocketInode scans /proc/net/tcp and /proc/net/tcp6 for an
// ESTABLISHED entry whose local port is clientPort and remote port is
// proxyPort. Returns the inode (or 0 if no match).
func findSocketInode(clientPort, proxyPort int) (uint64, error) {
	for _, path := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
		inode, err := scanProcNetTCP(path, clientPort, proxyPort)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return 0, err
		}
		if inode != 0 {
			return inode, nil
		}
	}
	return 0, nil
}

// scanProcNetTCP parses /proc/net/tcp{,6} looking for the inode of
// the socket with local port `clientPort` and remote port `proxyPort`.
//
// /proc/net/tcp columns (whitespace-separated, header skipped):
//
//	sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode ...
//
// local_address and rem_address are "HEX_ADDR:HEX_PORT" — we only
// care about the port halves. state is the connection state in hex;
// 0x01 = ESTABLISHED.
func scanProcNetTCP(path string, clientPort, proxyPort int) (uint64, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		if i == 0 {
			continue // header
		}
		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}
		// fields[1] local_address, [2] remote_address, [3] state, [9] inode.
		local := fields[1]
		remote := fields[2]
		state := fields[3]
		if state != "01" { // ESTABLISHED
			continue
		}
		localPort, ok := hexPort(local)
		if !ok || localPort != clientPort {
			continue
		}
		remotePort, ok := hexPort(remote)
		if !ok || remotePort != proxyPort {
			continue
		}
		inode, err := strconv.ParseUint(fields[9], 10, 64)
		if err != nil {
			continue
		}
		return inode, nil
	}
	return 0, nil
}

// hexPort extracts the integer port from a "HEX_ADDR:HEX_PORT"
// string. The port half is always 4 uppercase hex digits.
func hexPort(s string) (int, bool) {
	i := strings.IndexByte(s, ':')
	if i < 0 || i+1 >= len(s) {
		return 0, false
	}
	p, err := strconv.ParseInt(s[i+1:], 16, 32)
	if err != nil {
		return 0, false
	}
	return int(p), true
}

// findPIDForInode walks /proc looking for the PID whose /proc/<pid>/fd
// contains a symlink to "socket:[<inode>]". Returns the PID or 0 if
// no process owns the inode (e.g. it was closed between detection and
// scan).
func findPIDForInode(inode uint64) (int, error) {
	wanted := fmt.Sprintf("socket:[%d]", inode)

	entries, err := os.ReadDir("/proc")
	if err != nil {
		return 0, fmt.Errorf("read /proc: %w", err)
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue // non-pid directories
		}
		fdDir := filepath.Join("/proc", e.Name(), "fd")
		fds, err := os.ReadDir(fdDir)
		if err != nil {
			continue // permission denied / vanished
		}
		for _, fd := range fds {
			target, err := os.Readlink(filepath.Join(fdDir, fd.Name()))
			if err != nil {
				continue
			}
			if target == wanted {
				return pid, nil
			}
		}
	}
	return 0, nil
}

// platformWalkProcessTree walks /proc/<pid>/stat from pid up through
// its parents, capturing comm, full path (/proc/<pid>/exe), and the
// joined cmdline. Best-effort: vanished/inaccessible ancestors
// terminate the walk at the last successful step.
func platformWalkProcessTree(pid int) ([]ProcessInfo, error) {
	const maxDepth = 64
	chain := make([]ProcessInfo, 0, 8)
	current := pid
	for i := 0; i < maxDepth && current > 1; i++ {
		info, err := readProcessInfoLinux(current)
		if err != nil {
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

func readProcessInfoLinux(pid int) (ProcessInfo, error) {
	base := filepath.Join("/proc", strconv.Itoa(pid))
	statBytes, err := os.ReadFile(filepath.Join(base, "stat"))
	if err != nil {
		return ProcessInfo{}, err
	}
	comm, ppid, err := parseProcStat(statBytes)
	if err != nil {
		return ProcessInfo{}, err
	}
	path, _ := os.Readlink(filepath.Join(base, "exe"))
	cmdline, _ := readCmdline(filepath.Join(base, "cmdline"))
	name := comm
	if path != "" {
		name = filepath.Base(path)
	}
	return ProcessInfo{
		PID:        pid,
		PPID:       ppid,
		Name:       name,
		Path:       path,
		CmdlineRaw: cmdline,
	}, nil
}

// parseProcStat extracts (comm, ppid) from a /proc/<pid>/stat
// payload. The comm column can contain spaces and parens, so we
// locate the LAST ')' to bound it.
func parseProcStat(buf []byte) (comm string, ppid int, err error) {
	s := string(buf)
	open := strings.IndexByte(s, '(')
	close := strings.LastIndexByte(s, ')')
	if open < 0 || close < 0 || close <= open {
		return "", 0, fmt.Errorf("processdetect: malformed /proc stat")
	}
	comm = s[open+1 : close]
	rest := strings.Fields(s[close+1:])
	if len(rest) < 2 {
		return "", 0, fmt.Errorf("processdetect: short /proc stat fields")
	}
	// rest[0] = state, rest[1] = ppid
	ppid64, err := strconv.ParseInt(rest[1], 10, 32)
	if err != nil {
		return "", 0, fmt.Errorf("processdetect: parse ppid: %w", err)
	}
	return comm, int(ppid64), nil
}

// readCmdline reads a /proc/<pid>/cmdline file (NUL-separated argv)
// and joins on space for the matcher. Empty on failure.
func readCmdline(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	// Cmdline ends with a trailing NUL; strip it before splitting
	// so we don't generate a spurious empty arg.
	for len(b) > 0 && b[len(b)-1] == 0 {
		b = b[:len(b)-1]
	}
	parts := strings.Split(string(b), "\x00")
	return strings.Join(parts, " "), nil
}
