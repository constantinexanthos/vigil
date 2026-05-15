//go:build windows

package main

import (
	"os"
	"os/exec"
)

// platformExec runs the wrapped command and waits for it on Windows.
// Windows has no syscall.Exec equivalent, so we spawn a child and
// proxy stdio. The wrapper process stays alive for the child's
// lifetime — process-introspection tooling will see "vigil-run" rather
// than the child's binary, but on Windows that's the price; the
// VIGIL_TOKEN injection still works the same way.
//
// We propagate the child's exit code via os.Exit so the parent shell
// sees the same return value it would have seen running the wrapped
// command directly.
func platformExec(bin string, args, env []string) error {
	cmd := exec.Command(bin, args[1:]...)
	cmd.Env = env
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		return err
	}
	os.Exit(0)
	return nil
}
