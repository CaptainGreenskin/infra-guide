package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"slices"
	"strings"
	"syscall"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/workqueue"
)

const (
	namespace     = "report-sink-lab"
	finalizer     = "reports.infraguide.test/remove-sink"
	crashExitCode = 73
)

var resource = schema.GroupVersionResource{Group: "reports.infraguide.test", Version: "v1", Resource: "reportsinks"}

type controller struct {
	resources        dynamic.NamespaceableResourceInterface
	provider         string
	http             *http.Client
	crashAfterCreate bool
}

func runWorker(kubeconfig, provider, readyFile string, crash bool) error {
	cfg, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
	if err != nil {
		return err
	}
	if !isLoopback(cfg.Host) || !isLoopback(provider) || cfg.ExecProvider != nil || cfg.AuthProvider != nil {
		return fmt.Errorf("worker requires the lab's loopback endpoints and in-file credentials")
	}
	cfg.Proxy = noProxy
	client, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	queue := workqueue.NewTypedRateLimitingQueue(workqueue.DefaultTypedControllerRateLimiter[string]())
	defer queue.ShutDown()
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(client, 0, namespace, nil)
	informer := factory.ForResource(resource).Informer()
	enqueue := func(obj any) {
		key, err := cache.DeletionHandlingMetaNamespaceKeyFunc(obj)
		if err == nil {
			queue.Add(key)
		}
	}
	registration, err := informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: enqueue, UpdateFunc: func(_, current any) { enqueue(current) }, DeleteFunc: enqueue,
	})
	if err != nil {
		return err
	}
	factory.Start(ctx.Done())
	if !cache.WaitForCacheSync(ctx.Done(), registration.HasSynced) {
		return fmt.Errorf("initial list did not sync")
	}
	if err := os.WriteFile(readyFile, []byte("ready\n"), 0o600); err != nil {
		return err
	}
	go func() {
		<-ctx.Done()
		queue.ShutDown()
	}()
	c := controller{resources: client.Resource(resource), provider: provider, crashAfterCreate: crash,
		http: &http.Client{Transport: &http.Transport{}, Timeout: 4 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	for {
		key, shutdown := queue.Get()
		if shutdown {
			return nil
		}
		if err := c.reconcile(ctx, key); err != nil && ctx.Err() == nil {
			fmt.Fprintln(os.Stderr, "retry", key, err)
			queue.AddRateLimited(key)
		} else {
			queue.Forget(key)
		}
		queue.Done(key)
	}
}

func (c controller) reconcile(ctx context.Context, key string) error {
	ns, name, err := cache.SplitMetaNamespaceKey(key)
	if err != nil {
		return err
	}
	api := c.resources.Namespace(ns)
	obj, err := api.Get(ctx, name, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}
	uid := string(obj.GetUID())
	finalizers := obj.GetFinalizers()
	hasFinalizer := slices.Contains(finalizers, finalizer)
	if obj.GetDeletionTimestamp() != nil {
		if !hasFinalizer {
			return nil
		}
		if err := c.changeSink(ctx, http.MethodDelete, uid, ""); err != nil {
			return err
		}
		obj.SetFinalizers(slices.DeleteFunc(finalizers, func(value string) bool { return value == finalizer }))
		_, err := api.Update(ctx, obj, metav1.UpdateOptions{})
		return err
	}
	if !hasFinalizer {
		obj.SetFinalizers(append(finalizers, finalizer))
		_, err := api.Update(ctx, obj, metav1.UpdateOptions{})
		return err
	}
	observed, _, err := unstructured.NestedInt64(obj.Object, "status", "observedGeneration")
	if err != nil || observed == obj.GetGeneration() {
		return err
	}
	target, _, err := unstructured.NestedString(obj.Object, "spec", "target")
	if err != nil {
		return err
	}
	if err := c.changeSink(ctx, http.MethodPut, uid, target); err != nil {
		return err
	}
	if c.crashAfterCreate {
		os.Exit(crashExitCode) // The provider acknowledged the write, before UpdateStatus.
	}
	obj.Object["status"] = map[string]any{"observedGeneration": obj.GetGeneration(), "sinkUID": uid}
	_, err = api.UpdateStatus(ctx, obj, metav1.UpdateOptions{})
	return err
}

func (c controller) changeSink(ctx context.Context, method, uid, target string) error {
	req, err := http.NewRequestWithContext(ctx, method, c.provider+"/sinks/"+url.PathEscape(uid), strings.NewReader(target))
	if err != nil {
		return err
	}
	response, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if _, err := io.Copy(io.Discard, response.Body); err != nil {
		return err
	}
	if response.StatusCode != http.StatusCreated && response.StatusCode != http.StatusOK && response.StatusCode != http.StatusNoContent {
		return fmt.Errorf("provider %s returned %d", method, response.StatusCode)
	}
	return nil
}

func isLoopback(address string) bool {
	value, err := url.Parse(address)
	if err != nil {
		return false
	}
	return net.ParseIP(value.Hostname()).IsLoopback()
}

func noProxy(*http.Request) (*url.URL, error) { return nil, nil }

func labConfig(config *rest.Config) *rest.Config {
	copy := rest.CopyConfig(config)
	copy.Proxy = noProxy
	return copy
}
