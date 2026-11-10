// Observe authorization, admission, and object storage on a private API server.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	admission "k8s.io/api/admissionregistration/v1"
	authentication "k8s.io/api/authentication/v1"
	authorization "k8s.io/api/authorization/v1"
	core "k8s.io/api/core/v1"
	rbac "k8s.io/api/rbac/v1"
	meta "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"sigs.k8s.io/controller-runtime/pkg/envtest"
)

const (
	writerName  = "report-writer"
	policyName  = "reports-no-privileged"
	policyLabel = "report-admission"
	policyMatch = "enforced"
	message     = "report containers must not run privileged"
	expression  = "object.spec.containers.all(c, !has(c.securityContext) || !has(c.securityContext.privileged) || !c.securityContext.privileged)"
)

type response struct {
	Code int             `json:"code"`
	Body json.RawMessage `json:"body"`
}

type fixture struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Privileged bool   `json:"privileged"`
}

type observation struct {
	Request       fixture                                 `json:"request"`
	Authorization authorization.SubjectAccessReviewStatus `json:"authorization"`
	Create        response                                `json:"create"`
	AdminGet      response                                `json:"admin_get"`
}

func podFor(test fixture) core.Pod {
	noToken := false
	return core.Pod{
		TypeMeta:   meta.TypeMeta{APIVersion: "v1", Kind: "Pod"},
		ObjectMeta: meta.ObjectMeta{Name: test.Name, Namespace: test.Namespace},
		Spec: core.PodSpec{
			SchedulerName: "unavailable-teaching-scheduler", AutomountServiceAccountToken: &noToken,
			Containers: []core.Container{{Name: "report", Image: "example.invalid/report:v1",
				SecurityContext: &core.SecurityContext{Privileged: &test.Privileged}}},
		},
	}
}

func call(ctx context.Context, client *http.Client, method, endpoint string, input any) (response, error) {
	var body io.Reader
	if input != nil {
		data, err := json.Marshal(input)
		if err != nil {
			return response{}, err
		}
		body = bytes.NewReader(data)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return response{}, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	result, err := client.Do(request)
	if err != nil {
		return response{}, err
	}
	defer result.Body.Close()
	data, err := io.ReadAll(io.LimitReader(result.Body, 1<<20))
	if err != nil {
		return response{}, err
	}
	if !json.Valid(data) {
		return response{}, fmt.Errorf("API response is not JSON, status %d", result.StatusCode)
	}
	return response{Code: result.StatusCode, Body: data}, nil
}

func configureNamespace(ctx context.Context, admin kubernetes.Interface, name string, policy, grant bool) error {
	labels := map[string]string{}
	if policy {
		labels[policyLabel] = policyMatch
	}
	_, err := admin.CoreV1().Namespaces().Create(ctx, &core.Namespace{ObjectMeta: meta.ObjectMeta{Name: name, Labels: labels}}, meta.CreateOptions{})
	if err != nil {
		return err
	}
	_, err = admin.CoreV1().ServiceAccounts(name).Create(ctx, &core.ServiceAccount{ObjectMeta: meta.ObjectMeta{Name: "default"}}, meta.CreateOptions{})
	if err != nil || !grant {
		return err
	}
	role := &rbac.Role{ObjectMeta: meta.ObjectMeta{Name: "pod-submit"}, Rules: []rbac.PolicyRule{{
		APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"create"},
	}}}
	if _, err := admin.RbacV1().Roles(name).Create(ctx, role, meta.CreateOptions{}); err != nil {
		return err
	}
	binding := &rbac.RoleBinding{ObjectMeta: meta.ObjectMeta{Name: role.Name},
		RoleRef:  rbac.RoleRef{APIGroup: rbac.GroupName, Kind: "Role", Name: role.Name},
		Subjects: []rbac.Subject{{APIGroup: rbac.GroupName, Kind: "User", Name: writerName}}}
	_, err = admin.RbacV1().RoleBindings(name).Create(ctx, binding, meta.CreateOptions{})
	return err
}

func installPolicy(ctx context.Context, admin kubernetes.Interface) error {
	failure := admission.Fail
	reason := meta.StatusReasonInvalid
	policy := &admission.ValidatingAdmissionPolicy{ObjectMeta: meta.ObjectMeta{Name: policyName},
		Spec: admission.ValidatingAdmissionPolicySpec{
			FailurePolicy: &failure,
			MatchConstraints: &admission.MatchResources{ResourceRules: []admission.NamedRuleWithOperations{{
				RuleWithOperations: admission.RuleWithOperations{Operations: []admission.OperationType{admission.Create},
					Rule: admission.Rule{APIGroups: []string{""}, APIVersions: []string{"v1"}, Resources: []string{"pods"}}},
			}}},
			Validations: []admission.Validation{{Expression: expression, Message: message, Reason: &reason}},
		}}
	if _, err := admin.AdmissionregistrationV1().ValidatingAdmissionPolicies().Create(ctx, policy, meta.CreateOptions{}); err != nil {
		return err
	}
	binding := &admission.ValidatingAdmissionPolicyBinding{ObjectMeta: meta.ObjectMeta{Name: policyName},
		Spec: admission.ValidatingAdmissionPolicyBindingSpec{
			PolicyName: policyName, ValidationActions: []admission.ValidationAction{admission.Deny},
			MatchResources: &admission.MatchResources{NamespaceSelector: &meta.LabelSelector{
				MatchLabels: map[string]string{policyLabel: policyMatch},
			}},
		}}
	_, err := admin.AdmissionregistrationV1().ValidatingAdmissionPolicyBindings().Create(ctx, binding, meta.CreateOptions{})
	return err
}

func authorize(ctx context.Context, writer kubernetes.Interface, namespace string) (authorization.SubjectAccessReviewStatus, error) {
	input := &authorization.SelfSubjectAccessReview{Spec: authorization.SelfSubjectAccessReviewSpec{
		ResourceAttributes: &authorization.ResourceAttributes{Namespace: namespace, Verb: "create", Version: "v1", Resource: "pods"},
	}}
	result, err := writer.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, input, meta.CreateOptions{})
	if err != nil {
		return authorization.SubjectAccessReviewStatus{}, err
	}
	return result.Status, nil
}

func verifyObservation(got observation, createCode int) error {
	if got.Authorization.Allowed != (createCode != 403) || got.Create.Code != createCode {
		return fmt.Errorf("%s authorization or creation differed: %+v, %d %s", got.Request.Name, got.Authorization, got.Create.Code, got.Create.Body)
	}
	if createCode != 201 {
		if got.AdminGet.Code != 404 {
			return fmt.Errorf("%s was present after denial", got.Request.Name)
		}
		var status meta.Status
		if err := json.Unmarshal(got.Create.Body, &status); err != nil {
			return err
		}
		if createCode == 422 && (status.Reason != meta.StatusReasonInvalid || !strings.Contains(status.Message, message)) {
			return fmt.Errorf("expected admission policy rejection, got %s", got.Create.Body)
		}
		if createCode == 403 && (status.Reason != meta.StatusReasonForbidden || !strings.Contains(status.Message, writerName)) {
			return fmt.Errorf("expected authorization rejection, got %s", got.Create.Body)
		}
		return nil
	}
	if got.AdminGet.Code != 200 {
		return fmt.Errorf("%s could not be read after creation", got.Request.Name)
	}
	var created, stored core.Pod
	if err := json.Unmarshal(got.Create.Body, &created); err != nil {
		return err
	}
	if err := json.Unmarshal(got.AdminGet.Body, &stored); err != nil {
		return err
	}
	if created.UID == "" || created.UID != stored.UID || stored.Name != got.Request.Name || stored.Namespace != got.Request.Namespace ||
		len(stored.Spec.Containers) != 1 || stored.Spec.Containers[0].SecurityContext == nil ||
		stored.Spec.Containers[0].SecurityContext.Privileged == nil || *stored.Spec.Containers[0].SecurityContext.Privileged != got.Request.Privileged {
		return fmt.Errorf("stored Pod differs from request or creation UID: %s", got.AdminGet.Body)
	}
	return nil
}

func loopback(raw string) (string, string, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", "", err
	}
	if ip := net.ParseIP(parsed.Hostname()); ip == nil || !ip.IsLoopback() {
		return "", "", fmt.Errorf("expected a local test endpoint: %s", raw)
	}
	return parsed.Hostname(), parsed.Host, nil
}

func run(ctx context.Context, assets string) (result map[string]any, err error) {
	for _, name := range []string{"TEST_ASSET_KUBE_APISERVER", "TEST_ASSET_ETCD", "TEST_ASSET_KUBECTL", "KUBEBUILDER_ASSETS"} {
		if os.Getenv(name) != "" {
			return nil, fmt.Errorf("unset %s and use --assets", name)
		}
	}
	useExisting := false
	environment := &envtest.Environment{UseExistingCluster: &useExisting, BinaryAssetsDirectory: assets, ControlPlaneStartTimeout: 30 * time.Second}
	addresses, hosts := map[string]string{}, map[string]string{}
	defer func() {
		err = errors.Join(err, environment.Stop())
		if err != nil || result == nil {
			return
		}
		for name, address := range addresses {
			connection, dialErr := net.DialTimeout("tcp", address, 300*time.Millisecond)
			if dialErr == nil {
				connection.Close()
				err = fmt.Errorf("%s is still listening after shutdown", name)
				return
			}
		}
		result["isolation"] = map[string]any{"hosts": hosts, "listeners_closed": true, "used_existing_cluster": false}
	}()
	adminConfig, err := environment.Start()
	if err != nil {
		return nil, err
	}
	for name, endpoint := range map[string]string{"kube_apiserver": adminConfig.Host, "etcd": environment.ControlPlane.Etcd.URL.String()} {
		hosts[name], addresses[name], err = loopback(endpoint)
		if err != nil {
			return nil, err
		}
	}
	adminConfig.Proxy = func(*http.Request) (*url.URL, error) { return nil, nil }
	admin, err := kubernetes.NewForConfig(adminConfig)
	if err != nil {
		return nil, err
	}
	user, err := environment.AddUser(envtest.User{Name: writerName}, nil)
	if err != nil {
		return nil, err
	}
	writerConfig := user.Config()
	writerConfig.Proxy = adminConfig.Proxy
	writer, err := kubernetes.NewForConfig(writerConfig)
	if err != nil {
		return nil, err
	}
	adminHTTP, err := rest.HTTPClientFor(adminConfig)
	if err != nil {
		return nil, err
	}
	defer adminHTTP.CloseIdleConnections()
	writerHTTP, err := rest.HTTPClientFor(writerConfig)
	if err != nil {
		return nil, err
	}
	defer writerHTTP.CloseIdleConnections()
	identity, err := writer.AuthenticationV1().SelfSubjectReviews().Create(ctx, &authentication.SelfSubjectReview{}, meta.CreateOptions{})
	if err != nil {
		return nil, err
	}
	if identity.Status.UserInfo.Username != writerName {
		return nil, fmt.Errorf("unexpected request identity: %s", identity.Status.UserInfo.Username)
	}
	if err := configureNamespace(ctx, admin, "report-a", true, true); err != nil {
		return nil, err
	}
	if err := configureNamespace(ctx, admin, "report-b", false, true); err != nil {
		return nil, err
	}
	if err := configureNamespace(ctx, admin, "report-c", true, false); err != nil {
		return nil, err
	}
	if err := installPolicy(ctx, admin); err != nil {
		return nil, err
	}
	base := strings.TrimRight(adminConfig.Host, "/")
	endpoint := func(namespace string) string { return base + "/api/v1/namespaces/" + namespace + "/pods" }
	// Wait for both RBAC and policy caches with a dry-run that cannot store a Pod.
	probe := fixture{Name: "policy-ready", Namespace: "report-a", Privileged: true}
	err = wait.PollUntilContextTimeout(ctx, 100*time.Millisecond, 15*time.Second, true, func(ctx context.Context) (bool, error) {
		res, err := call(ctx, writerHTTP, "POST", endpoint(probe.Namespace)+"?dryRun=All", podFor(probe))
		return res.Code == 422 && bytes.Contains(res.Body, []byte(message)), err
	})
	if err != nil {
		return nil, fmt.Errorf("policy dry-run did not reach expected denial: %w", err)
	}
	// Independent observations after dry-run use ordinary create and administrator GET.
	cases := []struct {
		fixture
		code int
	}{
		{fixture{"safe", "report-a", false}, 201},
		{fixture{"privileged", "report-a", true}, 422},
		{fixture{"privileged", "report-b", true}, 201},
		{fixture{"privileged", "report-c", true}, 403},
	}
	observations := make([]observation, 0, len(cases))
	for _, test := range cases {
		var access authorization.SubjectAccessReviewStatus
		err := wait.PollUntilContextTimeout(ctx, 100*time.Millisecond, 8*time.Second, true, func(ctx context.Context) (bool, error) {
			var reviewErr error
			access, reviewErr = authorize(ctx, writer, test.Namespace)
			return access.Allowed == (test.code != 403), reviewErr
		})
		if err != nil {
			return nil, err
		}
		created, err := call(ctx, writerHTTP, "POST", endpoint(test.Namespace), podFor(test.fixture))
		if err != nil {
			return nil, err
		}
		stored, err := call(ctx, adminHTTP, "GET", endpoint(test.Namespace)+"/"+test.Name, nil)
		if err != nil {
			return nil, err
		}
		got := observation{Request: test.fixture, Authorization: access, Create: created, AdminGet: stored}
		if err := verifyObservation(got, test.code); err != nil {
			return nil, err
		}
		observations = append(observations, got)
	}
	return map[string]any{"identity": map[string]any{"username": identity.Status.UserInfo.Username, "groups": identity.Status.UserInfo.Groups}, "cases": observations,
		"policy": map[string]any{"name": policyName, "expression": expression, "message": message,
			"namespace_selector": map[string]string{policyLabel: policyMatch}, "actions": []string{"Deny"}, "operations": []string{"CREATE"}}}, nil
}

func digest(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}

func main() {
	assets := flag.String("assets", "", "path to official envtest 1.35.0 executables")
	output := flag.String("output", "", "path to JSON observations")
	flag.Parse()
	if *assets == "" || *output == "" {
		flag.Usage()
		os.Exit(2)
	}
	if err := execute(*assets, *output); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func execute(assets, output string) error {
	assets, err := filepath.Abs(assets)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	environment := map[string]any{"os": runtime.GOOS, "arch": runtime.GOARCH, "go": runtime.Version(), "client_go": "v0.35.8", "envtest": "v0.23.3"}
	for _, name := range []string{"kube-apiserver", "etcd"} {
		path := filepath.Join(assets, name)
		info, err := exec.CommandContext(ctx, path, "--version").Output()
		if err != nil {
			return err
		}
		version := strings.SplitN(strings.TrimSpace(string(info)), "\n", 2)[0]
		if name == "kube-apiserver" && version != "Kubernetes v1.35.0" {
			return fmt.Errorf("wrong API server version: %s", version)
		}
		hash, err := digest(path)
		if err != nil {
			return err
		}
		environment[name] = map[string]string{"version": version, "sha256": hash}
	}
	sourceHashes := map[string]string{}
	for _, name := range []string{"main.go", "go.mod", "go.sum"} {
		sourceHashes[name], err = digest(name)
		if err != nil {
			return err
		}
	}
	observations, err := run(ctx, assets)
	if err != nil {
		return err
	}
	report := map[string]any{"schema": 1, "environment": environment, "source_sha256": sourceHashes, "observations": observations}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(output, append(data, '\n'), 0o644)
}
