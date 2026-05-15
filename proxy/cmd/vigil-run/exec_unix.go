//go:build !windows

package main

import "syscall"

// platformExec uses syscall.Exec to replace the current process with the
// wrapped command. On success this function never returns — the wrapper
// PID is gone, replaced by the child. The kernel handles signal delivery
// from now on, and any tool that scans /proc sees the real binary
// (important for v0.1.0e Tier-1 process introspection).
func platformExec(bin string, args, env []string) error {
	return syscall.Exec(bin, args, env)
}
