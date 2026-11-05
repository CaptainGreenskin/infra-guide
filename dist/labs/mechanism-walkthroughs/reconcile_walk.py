"""Small in-memory reconciliation model, not Kubernetes API emulation."""
import copy
import json


class Store:
    def __init__(self):
        self.revision = 0
        self.next_uid = 0
        self.object = {'uid': 'owner-A', 'generation': 1, 'spec': {'replicas': 2},
                       'status': {'observedGeneration': 0, 'replicas': 0, 'readyReplicas': 0}}
        self.pods = {}
        self.bump()

    def bump(self):
        self.revision += 1
        # Readers compare this token for equality; never parse it as a number.
        self.object['resourceVersion'] = 'opaque-' + str(self.revision)

    def read(self):
        return copy.deepcopy(self.object)

    def set_replicas(self, expected_version, replicas):
        if expected_version != self.object['resourceVersion']:
            return 'conflict'
        if replicas != self.object['spec']['replicas']:
            self.object['spec']['replicas'] = replicas
            self.object['generation'] += 1
            self.bump()
        return 'accepted'

    def create(self, name):
        if name in self.pods:
            return self.pods[name]
        self.next_uid += 1
        pod = {'name': name, 'uid': 'pod-' + str(self.next_uid),
               'owner': self.object['uid'], 'ready': False}
        self.pods[name] = pod
        return pod

    def sync(self):
        desired = self.read()
        owned = [p for p in self.pods.values() if p['owner'] == desired['uid']]
        if len(owned) < desired['spec']['replicas']:
            name = next('p'+str(i) for i in range(100) if 'p'+str(i) not in self.pods)
            self.create(name)
        elif len(owned) > desired['spec']['replicas']:
            del self.pods[owned[-1]['name']]
        actual = [p for p in self.pods.values() if p['owner'] == desired['uid']]
        status = {'observedGeneration': desired['generation'], 'replicas': len(actual),
                  'readyReplicas': sum(p['ready'] for p in actual)}
        if status != self.object['status']:
            self.object['status'] = status
            self.bump()

    def delete_pod(self, name, expected_uid):
        if name not in self.pods or self.pods[name]['uid'] != expected_uid:
            return 'uid-mismatch'
        del self.pods[name]
        return 'deleted'


def main():
    s = Store()
    old = s.read()
    assert s.set_replicas(old['resourceVersion'], 3) == 'accepted'
    accepted = s.read()
    assert (accepted['generation'], accepted['status']['observedGeneration']) == (2, 0)
    assert not s.pods
    assert s.set_replicas(old['resourceVersion'], 1) == 'conflict'
    for _ in range(8):  # Duplicate wake-ups still converge to three, not eight.
        s.sync()
    converged = s.read()
    assert len(s.pods) == 3 and converged['status'] == {'observedGeneration': 2, 'replicas': 3, 'readyReplicas': 0}
    s.sync()
    assert s.read() == converged  # No change needed; avoid a needless status write.
    old_uid = s.pods['p0']['uid']
    assert s.delete_pod('p0', old_uid) == 'deleted'
    s.sync()
    new_uid = s.pods['p0']['uid']
    assert new_uid != old_uid
    assert s.delete_pod('p0', old_uid) == 'uid-mismatch'
    for pod in s.pods.values():
        pod['ready'] = True
    s.sync()
    ready = s.read()
    assert ready['generation'] == 2 and ready['status']['readyReplicas'] == 3
    assert ready['resourceVersion'] != converged['resourceVersion']
    assert s.set_replicas(ready['resourceVersion'], 1) == 'accepted'
    for _ in range(3):
        s.sync()
    assert len(s.pods) == 1
    print(json.dumps({'accepted': accepted, 'converged': converged,
                      'replacement': {'old_uid': old_uid, 'new_uid': new_uid,
                                      'stale_delete': 'uid-mismatch'},
                      'ready': ready, 'scaled_down': s.read(),
                      'stale_update': 'conflict', 'noop_keeps_version': True}, indent=2))


if __name__ == '__main__':
    main()
