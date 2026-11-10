package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"
	"syscall"
	"time"

	apiv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	configapi "k8s.io/client-go/tools/clientcmd/api"
	"sigs.k8s.io/controller-runtime/pkg/envtest"
)

const reportSinkCRD = `{
  "apiVersion":"apiextensions.k8s.io/v1","kind":"CustomResourceDefinition",
  "metadata":{"name":"reportsinks.reports.infraguide.test"},
  "spec":{
    "group":"reports.infraguide.test","scope":"Namespaced",
    "names":{"kind":"ReportSink","plural":"reportsinks","singular":"reportsink"},
    "versions":[{"name":"v1","served":true,"storage":true,"subresources":{"status":{}},
      "schema":{"openAPIV3Schema":{"type":"object","required":["spec"],"properties":{
        "spec":{"type":"object","required":["target"],"properties":{
          "target":{"type":"string","minLength":1,"maxLength":100,"pattern":"^[a-z0-9-]+$",
            "x-kubernetes-validations":[{"rule":"self == oldSelf","message":"target is immutable"}]}
        }},
        "status":{"type":"object","properties":{
          "observedGeneration":{"type":"integer","format":"int64"},"sinkUID":{"type":"string"}
        }}
      }}}
    }]
  }
}`

type providerEvent struct {
	Method string `json:"method"`
	UID    string `json:"uid"`
	Status int    `json:"status"`
}

type provider struct {
	dir    string
	mu     sync.Mutex
	events []providerEvent
}

func (p *provider) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	uid, ok := strings.CutPrefix(req.URL.Path, "/sinks/")
	if !ok || uid == "" || uid == "." || uid == ".." || filepath.Base(uid) != uid {
		http.NotFound(w, req)
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	status, err := p.apply(filepath.Join(p.dir, uid), req)
	if err != nil {
		fmt.Fprintln(os.Stderr, "provider:", err)
		status = http.StatusInternalServerError
	}
	p.events = append(p.events, providerEvent{req.Method, uid, status})
	w.WriteHeader(status)
}

func (p *provider) apply(path string, req *http.Request) (int, error) {
	switch req.Method {
	case http.MethodPut:
		target, err := io.ReadAll(io.LimitReader(req.Body, 101))
		if err != nil || len(target) == 0 || len(target) > 100 {
			return http.StatusBadRequest, nil
		}
		previous, err := os.ReadFile(path)
		if err == nil {
			if string(previous) == string(target) {
				return http.StatusOK, nil
			}
			return http.StatusConflict, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return 0, err
		}
		file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err != nil {
			return 0, err
		}
		_, writeErr := file.Write(target)
		err = errors.Join(writeErr, file.Sync(), file.Close())
		if err != nil {
			return 0, errors.Join(err, os.Remove(path))
		}
		return http.StatusCreated, nil
	case http.MethodDelete:
		err := os.Remove(path)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return 0, err
		}
		return http.StatusNoContent, nil
	default:
		return http.StatusMethodNotAllowed, nil
	}
}

type providerState struct {
	PutAttempts    int    `json:"put_attempts"`
	DeleteAttempts int    `json:"delete_attempts"`
	Created        int    `json:"created"`
	EffectPresent  bool   `json:"effect_present"`
	Target         string `json:"target,omitempty"`
}

func (p *provider) snapshot(uid string) (providerState, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	var state providerState
	for _, event := range p.events {
		if event.UID != uid {
			continue
		}
		switch event.Method {
		case http.MethodPut:
			state.PutAttempts++
			if event.Status == http.StatusCreated {
				state.Created++
			}
		case http.MethodDelete:
			state.DeleteAttempts++
		}
	}
	data, err := os.ReadFile(filepath.Join(p.dir, uid))
	if errors.Is(err, os.ErrNotExist) {
		return state, nil
	}
	state.EffectPresent, state.Target = err == nil, string(data)
	return state, err
}

type snapshot struct {
	APIStatus          int           `json:"api_status"`
	UID                string        `json:"uid"`
	Generation         int64         `json:"generation"`
	ObservedGeneration int64         `json:"observed_generation"`
	StatusReported     bool          `json:"status_reported"`
	SinkUID            string        `json:"sink_uid,omitempty"`
	Finalizers         []string      `json:"finalizers,omitempty"`
	Deleting           bool          `json:"deleting"`
	DeletionTimestamp  string        `json:"deletion_timestamp,omitempty"`
	Provider           providerState `json:"provider"`
}

func observe(ctx context.Context, api dynamic.ResourceInterface, p *provider, name, uid string) (snapshot, error) {
	obj, apiErr := api.Get(ctx, name, metav1.GetOptions{})
	state, err := p.snapshot(uid)
	if err != nil {
		return snapshot{}, err
	}
	if apierrors.IsNotFound(apiErr) {
		return snapshot{APIStatus: 404, UID: uid, Provider: state}, nil
	}
	if apiErr != nil {
		return snapshot{}, apiErr
	}
	if string(obj.GetUID()) != uid {
		return snapshot{}, fmt.Errorf("%s changed UID", name)
	}
	observed, found, err := unstructured.NestedInt64(obj.Object, "status", "observedGeneration")
	if err != nil {
		return snapshot{}, err
	}
	sink, _, err := unstructured.NestedString(obj.Object, "status", "sinkUID")
	deletionTimestamp := ""
	if timestamp := obj.GetDeletionTimestamp(); timestamp != nil {
		deletionTimestamp = timestamp.UTC().Format(time.RFC3339Nano)
	}
	return snapshot{APIStatus: 200, UID: uid, Generation: obj.GetGeneration(), ObservedGeneration: observed,
		StatusReported: found, SinkUID: sink, Finalizers: obj.GetFinalizers(), Deleting: deletionTimestamp != "", DeletionTimestamp: deletionTimestamp,
		Provider: state}, err
}

type workerProcess struct {
	cmd    *exec.Cmd
	result <-chan error
	waited bool
	err    error
}

func (p *workerProcess) await(ctx context.Context) error {
	if !p.waited {
		select {
		case p.err = <-p.result:
			p.waited = true
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return p.err
}

func (p *workerProcess) stop() {
	if p.waited {
		return
	}
	_ = p.cmd.Process.Signal(os.Interrupt)
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	if p.await(ctx) == context.DeadlineExceeded {
		_ = p.cmd.Process.Kill()
		_ = p.await(context.Background())
	}
}

func startWorker(ctx context.Context, binary, kubeconfig, providerURL, readyFile string, crash bool) (*workerProcess, error) {
	mode := "normal"
	if crash {
		mode = "crash"
	}
	cmd := exec.CommandContext(ctx, binary, "worker", kubeconfig, providerURL, readyFile, mode)
	cmd.Env = append(os.Environ(), "KUBE_FEATURE_WatchListClient=false")
	cmd.Stdout, cmd.Stderr = os.Stderr, os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	result := make(chan error, 1)
	go func() { result <- cmd.Wait() }()
	process := &workerProcess{cmd: cmd, result: result}
	err := wait.PollUntilContextTimeout(ctx, 30*time.Millisecond, 10*time.Second, true, func(context.Context) (bool, error) {
		if _, err := os.Stat(readyFile); err == nil {
			return true, nil
		}
		select {
		case process.err = <-result:
			process.waited = true
			return false, fmt.Errorf("controller exited before initial LIST completed: %v", process.err)
		default:
			return false, nil
		}
	})
	if err != nil {
		process.stop()
		return nil, err
	}
	return process, nil
}

func kubeconfigFile(config *rest.Config, path string) error {
	cfg := configapi.Config{
		Clusters:  map[string]*configapi.Cluster{"lab": {Server: config.Host, CertificateAuthorityData: config.CAData}},
		AuthInfos: map[string]*configapi.AuthInfo{"lab": {ClientCertificateData: config.CertData, ClientKeyData: config.KeyData}},
		Contexts:  map[string]*configapi.Context{"lab": {Cluster: "lab", AuthInfo: "lab"}}, CurrentContext: "lab",
	}
	return clientcmd.WriteToFile(cfg, path)
}

func create(ctx context.Context, api dynamic.ResourceInterface, name, target string) (string, error) {
	obj := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "reports.infraguide.test/v1", "kind": "ReportSink",
		"metadata": map[string]any{"name": name, "namespace": namespace}, "spec": map[string]any{"target": target},
	}}
	result, err := api.Create(ctx, obj, metav1.CreateOptions{})
	if err != nil {
		return "", err
	}
	return string(result.GetUID()), nil
}

func ready(ctx context.Context, api dynamic.ResourceInterface, p *provider, name, uid string) (snapshot, error) {
	var state snapshot
	err := wait.PollUntilContextTimeout(ctx, 40*time.Millisecond, 12*time.Second, true, func(ctx context.Context) (bool, error) {
		var err error
		state, err = observe(ctx, api, p, name, uid)
		return state.StatusReported && state.Generation == state.ObservedGeneration && state.SinkUID == uid, err
	})
	return state, err
}

func run(ctx context.Context, assets string) (report map[string]any, err error) {
	for _, name := range []string{"TEST_ASSET_KUBE_APISERVER", "TEST_ASSET_ETCD", "TEST_ASSET_KUBECTL", "KUBEBUILDER_ASSETS"} {
		if os.Getenv(name) != "" {
			return nil, fmt.Errorf("unset %s and use the explicit --assets path", name)
		}
	}
	temp, err := os.MkdirTemp("", "infra-guide-controller-")
	if err != nil {
		return nil, err
	}
	defer func() { err = errors.Join(err, os.RemoveAll(temp)) }()
	var crd apiv1.CustomResourceDefinition
	if err := json.Unmarshal([]byte(reportSinkCRD), &crd); err != nil {
		return nil, err
	}
	useExisting := false
	controlPlane := &envtest.Environment{UseExistingCluster: &useExisting, BinaryAssetsDirectory: assets,
		CRDs: []*apiv1.CustomResourceDefinition{&crd}, ControlPlaneStartTimeout: 35 * time.Second}
	listeners := map[string]string{}
	defer func() {
		err = errors.Join(err, controlPlane.Stop())
		if err == nil && report != nil {
			var hosts map[string]string
			hosts, err = closedListeners(listeners)
			if err == nil {
				report["isolation"] = map[string]any{"hosts": hosts, "listeners_closed": true, "used_existing_cluster": false}
			}
		}
	}()
	config, err := controlPlane.Start()
	if err != nil {
		return nil, err
	}
	listeners["kube_apiserver"] = config.Host
	listeners["etcd"] = controlPlane.ControlPlane.Etcd.URL.String()
	if !isLoopback(listeners["kube_apiserver"]) || !isLoopback(listeners["etcd"]) {
		return nil, errors.New("envtest did not return loopback control-plane endpoints")
	}
	client, err := dynamic.NewForConfig(labConfig(config))
	if err != nil {
		return nil, err
	}
	_, err = client.Resource(schema.GroupVersionResource{Version: "v1", Resource: "namespaces"}).Create(ctx,
		&unstructured.Unstructured{Object: map[string]any{"apiVersion": "v1", "kind": "Namespace",
			"metadata": map[string]any{"name": namespace}}}, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}
	api := client.Resource(resource).Namespace(namespace)
	p := &provider{dir: filepath.Join(temp, "provider")}
	if err := os.Mkdir(p.dir, 0o700); err != nil {
		return nil, err
	}
	server := httptest.NewServer(p)
	defer server.Close()
	listeners["provider"] = server.URL
	if !isLoopback(server.URL) {
		return nil, errors.New("expected a loopback provider listener")
	}
	kubeconfig := filepath.Join(temp, "kubeconfig")
	if err := kubeconfigFile(config, kubeconfig); err != nil {
		return nil, err
	}
	binary, err := os.Executable()
	if err != nil {
		return nil, err
	}
	start := func(label string, crash bool) (*workerProcess, error) {
		return startWorker(ctx, binary, kubeconfig, server.URL, filepath.Join(temp, label+".ready"), crash)
	}
	normalWorker, err := start("normal", false)
	if err != nil {
		return nil, err
	}
	defer normalWorker.stop()
	normalUID, err := create(ctx, api, "normal", "daily-report")
	if err != nil {
		return nil, err
	}
	normal, err := ready(ctx, api, p, "normal", normalUID)
	if err != nil {
		return nil, fmt.Errorf("normal reconciliation: %w", err)
	}
	normalWorker.stop()

	replayUID, err := create(ctx, api, "replay", "weekly-report")
	if err != nil {
		return nil, err
	}
	crashing, err := start("crash", true)
	if err != nil {
		return nil, err
	}
	defer crashing.stop()
	crashCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	crashErr := crashing.await(crashCtx)
	cancel()
	var exited *exec.ExitError
	if !errors.As(crashErr, &exited) || exited.ExitCode() != crashExitCode {
		return nil, fmt.Errorf("expected actual worker exit %d, got %v", crashExitCode, crashErr)
	}
	crashed, err := observe(ctx, api, p, "replay", replayUID)
	if err != nil {
		return nil, err
	}
	restarted, err := start("restart", false)
	if err != nil {
		return nil, err
	}
	defer restarted.stop()
	replayed, err := ready(ctx, api, p, "replay", replayUID)
	if err != nil {
		return nil, fmt.Errorf("replay reconciliation: %w", err)
	}
	restarted.stop()

	if err := api.Delete(ctx, "replay", metav1.DeleteOptions{}); err != nil {
		return nil, err
	}
	retained, err := observe(ctx, api, p, "replay", replayUID)
	if err != nil {
		return nil, err
	}
	cleanupWorker, err := start("cleanup", false)
	if err != nil {
		return nil, err
	}
	defer cleanupWorker.stop()
	var removed snapshot
	err = wait.PollUntilContextTimeout(ctx, 40*time.Millisecond, 12*time.Second, true, func(ctx context.Context) (bool, error) {
		var err error
		removed, err = observe(ctx, api, p, "replay", replayUID)
		return removed.APIStatus == 404, err
	})
	if err != nil {
		return nil, fmt.Errorf("cleanup reconciliation: %w", err)
	}
	cleanupWorker.stop()
	otherProvider, err := p.snapshot(normalUID)
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	events := slices.Clone(p.events)
	p.mu.Unlock()
	if normal.Generation != 1 || normal.Provider != (providerState{1, 0, 1, true, "daily-report"}) ||
		crashed.Generation != 1 || crashed.StatusReported || !slices.Contains(crashed.Finalizers, finalizer) ||
		crashed.Provider != (providerState{1, 0, 1, true, "weekly-report"}) ||
		replayed.Generation != 1 || replayed.Provider != (providerState{2, 0, 1, true, "weekly-report"}) ||
		!retained.Deleting || !slices.Contains(retained.Finalizers, finalizer) || retained.Provider != replayed.Provider ||
		removed.Provider != (providerState{2, 1, 1, false, ""}) || otherProvider != normal.Provider ||
		!slices.Equal(events, []providerEvent{
			{http.MethodPut, normalUID, 201}, {http.MethodPut, replayUID, 201},
			{http.MethodPut, replayUID, 200}, {http.MethodDelete, replayUID, 204},
		}) {
		return nil, fmt.Errorf("controller or independent provider observations did not match")
	}
	return map[string]any{"normal": normal,
		"replay": map[string]any{"worker_exit_code": crashExitCode, "after_exit": crashed, "after_restart": replayed},
		"deletion": map[string]any{"retained": retained, "after_cleanup": removed, "other_sink_uid": normalUID,
			"other_provider_after_cleanup": otherProvider}, "provider_events": events}, nil
}

func closedListeners(listeners map[string]string) (map[string]string, error) {
	hosts := make(map[string]string, len(listeners))
	for name, address := range listeners {
		endpoint, err := url.Parse(address)
		if err != nil {
			return nil, err
		}
		hosts[name] = endpoint.Hostname()
		connection, err := net.DialTimeout("tcp", endpoint.Host, time.Second)
		if err == nil {
			connection.Close()
		}
		if !errors.Is(err, syscall.ECONNREFUSED) {
			return nil, fmt.Errorf("%s listener was not confirmed closed: %v", name, err)
		}
	}
	return hosts, nil
}

func hash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	digest := sha256.New()
	if _, err := io.Copy(digest, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", digest.Sum(nil)), nil
}

func execute() error {
	if len(os.Args) == 6 && os.Args[1] == "worker" {
		return runWorker(os.Args[2], os.Args[3], os.Args[4], os.Args[5] == "crash")
	}
	assets := flag.String("assets", "", "directory with the verified envtest binaries")
	output := flag.String("output", "", "write the validation JSON to this path")
	flag.Parse()
	if *assets == "" || *output == "" {
		return fmt.Errorf("--assets and --output are required")
	}
	assetDir, err := filepath.Abs(*assets)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 110*time.Second)
	defer cancel()
	environment := map[string]any{"os": runtime.GOOS, "architecture": runtime.GOARCH, "go": runtime.Version(),
		"client_go": "v0.35.8", "envtest": "v0.23.3", "scope": "one loopback kube-apiserver and etcd, separate loopback file provider"}
	for _, binary := range []string{"kube-apiserver", "etcd"} {
		path := filepath.Join(assetDir, binary)
		version, err := exec.CommandContext(ctx, path, "--version").Output()
		if err != nil {
			return err
		}
		if binary == "kube-apiserver" && strings.TrimSpace(string(version)) != "Kubernetes v1.35.0" {
			return fmt.Errorf("expected kube-apiserver v1.35.0")
		}
		fingerprint, err := hash(path)
		if err != nil {
			return err
		}
		environment[binary] = map[string]string{"version": strings.TrimSpace(string(version)), "sha256": fingerprint}
	}
	fileHashes := map[string]string{}
	for _, file := range []string{"controller.go", "main.go", "go.mod", "go.sum"} {
		fileHashes[file], err = hash(file)
		if err != nil {
			return err
		}
	}
	report, err := run(ctx, assetDir)
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(map[string]any{"schema": 1, "status": "passed", "environment": environment,
		"source_sha256": fileHashes, "report": report}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(*output, append(data, '\n'), 0o644); err != nil {
		return err
	}
	fmt.Println("normal 201; replay 201 → worker exit 73 → 200; delete retained → provider 204 → API 404")
	return nil
}

func main() {
	if err := execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
