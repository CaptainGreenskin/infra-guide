"""Two real loopback HTTP services with a small version-00 traceparent example."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
import re
import secrets
import threading
import time
import urllib.error
import urllib.request


def context(value):
    match=re.fullmatch(r'00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})',value or '')
    if match and int(match[1],16) and int(match[2],16):
        return match[1],match[2],match[3]
    return secrets.token_hex(16),None,'01'


def request(url,header):
    req=urllib.request.Request(url,headers={'traceparent':header})
    try:
        with urllib.request.urlopen(req,timeout=5) as result:
            return result.status,json.load(result)
    except urllib.error.HTTPError as error:
        with error:
            return error.code,json.load(error)


class Base(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def respond(self,status,payload):
        data=json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class Backend(Base):
    def do_GET(self):
        trace,parent,flags=context(self.headers.get('traceparent'))
        span=secrets.token_hex(8)
        start=time.perf_counter()
        slow=self.path=='/lookup?slow=1'
        time.sleep(.180 if slow else .001)  # injected waiting, not CPU work
        waited=time.perf_counter()
        time.sleep(.060 if slow else .001)  # injected processing wall time
        end=time.perf_counter()
        self.server.spans.append({'service':'backend','trace_id':trace,'span_id':span,'parent_id':parent,
                                  'waiting_ms':round((waited-start)*1000,3),'processing_ms':round((end-waited)*1000,3)})
        self.respond(200,{'trace_id':trace,'span_id':span})


class API(Base):
    def do_GET(self):
        start=time.perf_counter()
        trace,parent,flags=context(self.headers.get('traceparent'))
        span=secrets.token_hex(8)
        if self.path=='/reports?fail=1':
            status=503
        else:
            slow=self.path=='/reports?slow=1'
            time.sleep(.020 if slow else .001)
            child_header='00-%s-%s-%s'%(trace,span,flags)
            status,_=request(self.server.backend+('/lookup?slow=1' if slow else '/lookup'),child_header)
            time.sleep(.030 if slow else .001)
        elapsed=time.perf_counter()-start
        self.server.rows.append({'route':'/reports','outcome':'bad' if status>=500 else 'good',
                                 'status':status,'seconds':elapsed,'trace_id':trace,'span_id':span,'parent_id':parent})
        self.respond(status,{'trace_id':trace,'span_id':span})


def start(handler):
    server=ThreadingHTTPServer(('127.0.0.1',0),handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    return server,thread


def run():
    backend,bthread=start(Backend)
    backend.spans=[]
    api,athread=start(API)
    api.rows=[]
    api.backend='http://127.0.0.1:%d'%backend.server_port
    base='http://127.0.0.1:%d'%api.server_port
    try:
        parents=[]
        for path in ['/reports','/reports?slow=1','/reports?fail=1']:
            trace,parent=secrets.token_hex(16),secrets.token_hex(8)
            parents.append((trace,parent))
            if 'slow=1' in path:time.sleep(.010)  # client pre-request delay, outside API span
            status,body=request(base+path,'00-%s-%s-01'%(trace,parent))
            assert body['trace_id']==trace
            assert status==(503 if 'fail=1' in path else 200)
        assert len(api.rows)==3 and len(backend.spans)==2
        for row,(trace,parent) in zip(api.rows,parents):
            assert row['trace_id']==trace and row['parent_id']==parent
        for child in backend.spans:
            parent=next(row for row in api.rows if row['trace_id']==child['trace_id'])
            assert child['parent_id']==parent['span_id']
        assert len({row['span_id'] for row in api.rows})==3
        invalid_trace,invalid_parent,_=context('untrusted-invalid-header')
        assert len(invalid_trace)==32 and invalid_parent is None
        buckets={str(edge):sum(row['seconds']<=edge for row in api.rows) for edge in (.1,.5,1.)}
        buckets['+Inf']=len(api.rows)
        assert list(buckets.values())==sorted(buckets.values())
        assert sum(row['outcome']=='bad' for row in api.rows)==1
        return {'status':'passed','requests':3,'bad_requests':1,'backend_spans':2,
                'parent_child_links_verified':True,'invalid_header_starts_new_trace':True,
                'metric_labels':['route','outcome'],'classic_bucket_counts':buckets,
                'measured_api_ms':[round(row['seconds']*1000,3) for row in api.rows],
                'measured_slow_backend':{key:value for key,value in backend.spans[1].items() if key.endswith('_ms')},
                'scope':'Actual loopback HTTP and monotonic timing; injected sleeps are wall time, not CPU. Minimal version-00 propagation example, not an OTel SDK/interoperability test. No exported production telemetry or representative load.'}
    finally:
        api.shutdown();backend.shutdown()
        api.server_close();backend.server_close()
        athread.join(timeout=5);bthread.join(timeout=5)


if __name__=='__main__':
    print(json.dumps(run(),ensure_ascii=False,indent=2))
