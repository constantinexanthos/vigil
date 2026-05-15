//go:build !darwin && !linux

// walk_other.go is the build-target fallback for platforms where
// vigil-proxy compiles but Tier-1 process detection isn't
// implemented (today: Windows, plus any future BSD targets we don't
// explicitly support). The functions are wired through the same
// interface as walk_darwin.go and walk_linux.go but return
// "no detection" without erroring — so the proxy falls through
// cleanly to anonymous attribution.
//
// When we ship Windows detection (deferred per the brief), this file
// gets replaced by walk_windows.go and the build tag updated.

package processdetect

// platformResolveRemotePID always reports "no PID found" on
// unsupported platforms. The detector treats this as a normal
// undetectable connection.
func platformResolveRemotePID(localPort, remotePort int) (int, error) {
	return 0, nil
}

// platformWalkProcessTree always reports an empty chain on
// unsupported platforms. Pairs with the resolver above so the
// detector returns DetectedIdentity{} (Empty()=true) cleanly.
func platformWalkProcessTree(pid int) ([]ProcessInfo, error) {
	return nil, nil
}
