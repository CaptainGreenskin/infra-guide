// A small live SPIFFE Workload API client and mutually authenticated report receiver.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/spiffe/go-spiffe/v2/spiffeid"
	"github.com/spiffe/go-spiffe/v2/spiffetls/tlsconfig"
	"github.com/spiffe/go-spiffe/v2/workloadapi"
	"google.golang.org/grpc/status"
)

const (
	domain       = "infraguide.test"
	receiverID   = "spiffe://" + domain + "/report-api"
	allowedID    = "spiffe://" + domain + "/worker-a"
	claimedField = "X-Claimed-Spiffe-Id"
)

type report struct {
	Operation string `json:"operation_id"`
	Amount    int    `json:"amount"`
}

var fixture = report{Operation: "report-27:publish", Amount: 37}

func encode(v any) error { return json.NewEncoder(os.Stdout).Encode(v) }

func openSource(socket string) (*workloadapi.X509Source, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	return workloadapi.NewX509Source(ctx, workloadapi.WithClientOptions(workloadapi.WithAddr(socket)))
}

func fetchUnregistered(socket string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := workloadapi.New(ctx, workloadapi.WithAddr(socket))
	if err != nil {
		return err
	}
	defer client.Close()
	svids, err := client.FetchX509SVIDs(ctx)
	return encode(map[string]any{"grpc_code": status.Code(err).String(), "svid_count": len(svids)})
}

func appendRow(path string, row any) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0600)
	if err != nil {
		return err
	}
	defer file.Close()
	if err := json.NewEncoder(file).Encode(row); err != nil {
		return err
	}
	return file.Sync()
}

func serve(socket, effects, audits string) error {
	source, err := openSource(socket)
	if err != nil {
		return err
	}
	defer source.Close()
	svid, err := source.GetX509SVID()
	if err != nil {
		return err
	}
	if svid.ID.String() != receiverID {
		return fmt.Errorf("unexpected receiver SVID: %s", svid.ID)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return err
	}
	defer listener.Close()
	var journal sync.Mutex
	server := &http.Server{
		ReadHeaderTimeout: 3 * time.Second,
		TLSConfig: tlsconfig.MTLSServerConfig(source, source,
			tlsconfig.AuthorizeMemberOf(spiffeid.RequireTrustDomainFromString(domain))),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost || r.URL.Path != "/reports" {
				http.NotFound(w, r)
				return
			}
			var body report
			if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body); err != nil || body != fixture {
				http.Error(w, "invalid report", http.StatusBadRequest)
				return
			}
			// The mTLS configuration validated the leaf and its single SPIFFE URI.
			peer := r.TLS.PeerCertificates[0].URIs[0].String()
			claimed := r.Header.Get(claimedField)
			journal.Lock()
			defer journal.Unlock()
			decision, code := "denied", http.StatusForbidden
			if peer == allowedID {
				decision, code = "published", http.StatusCreated
				if err := appendRow(effects, map[string]any{"peer_id": peer, "report": body}); err != nil {
					http.Error(w, "effect write failed", http.StatusInternalServerError)
					return
				}
			}
			if err := appendRow(audits, map[string]any{
				"peer_id": peer, "claimed_id": claimed, "report": body, "decision": decision,
			}); err != nil {
				http.Error(w, "audit write failed", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(code)
			_ = json.NewEncoder(w).Encode(map[string]string{"status": decision})
		}),
	}
	if err := encode(map[string]string{"address": listener.Addr().String(), "server_id": svid.ID.String()}); err != nil {
		return err
	}
	return server.ServeTLS(listener, "", "")
}

func publish(socket, address string) error {
	source, err := openSource(socket)
	if err != nil {
		return err
	}
	defer source.Close()
	svid, err := source.GetX509SVID()
	if err != nil {
		return err
	}
	transport := &http.Transport{
		TLSClientConfig: tlsconfig.MTLSClientConfig(source, source,
			tlsconfig.AuthorizeID(spiffeid.RequireFromString(receiverID))),
		DisableKeepAlives: true,
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
	payload, err := json.Marshal(fixture)
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodPost, "https://"+address+"/reports", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(claimedField, allowedID)
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var body map[string]string
	if err := json.NewDecoder(io.LimitReader(response.Body, 1024)).Decode(&body); err != nil {
		return err
	}
	return encode(map[string]any{
		"http_status": response.StatusCode, "response": body, "client_id": svid.ID.String(),
		"server_id": response.TLS.PeerCertificates[0].URIs[0].String(),
	})
}

func run(args []string) error {
	usage := errors.New("usage: workload serve SOCKET EFFECTS AUDITS | publish SOCKET ADDRESS | probe SOCKET")
	if len(args) < 2 {
		return usage
	}
	switch args[0] {
	case "serve":
		if len(args) == 4 {
			return serve(args[1], args[2], args[3])
		}
	case "publish":
		if len(args) == 3 {
			return publish(args[1], args[2])
		}
	case "probe":
		if len(args) == 2 {
			return fetchUnregistered(args[1])
		}
	}
	return usage
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
